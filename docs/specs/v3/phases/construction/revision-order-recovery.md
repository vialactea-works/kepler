# Revision-order recovery proposal

[Construction runtime](runtime.md) | [Shared revision rules](../../revision.md) | [Shared runtime](../../runtime.md)

**Status: Draft for requester approval.** This is a proposed, narrowly scoped extension to the accepted contracts. It is not implemented, accepted policy, or permission to repair a mission. Existing replay and recovery guards remain binding until the requester approves the extension and compatible software implements it. Approval of this document does not approve implementation, application to particular records, release, or host deployment.

## Purpose and boundary

Recover a known missing-order defect in historical revision transitions without changing any existing event bytes. A CLI-generated ending can name its revision authorization but omit the affected attempt's latest state transition. When the records occupy separate journals, the reader cannot establish their order and correctly blocks the affected unit.

[Kepler PR #58](https://github.com/vialactea-works/kepler/pull/58) fixes future writes by naming the exact attempt's latest transition and, for an Implementation ending, the affected child Activity transitions. It does not repair records already written without those links.

This proposal permits a new CLI-owned fact to record an explicitly approved ordering attestation about exact existing event IDs. That attestation is new evidence, recorded after reconciliation. It does not claim that the original writer recorded a causal link, alter an old `caused_by` value, or certify the physical timing of work that the CLI cannot observe.

### Proposed changes to accepted contracts

If approved, the extension would:

- Add one Construction lifecycle operation and one phase-owned event type, described below. It would add no public audit kind, stage, task, replacement mission, or new attempt/revision identity.
- Permit a validated recovery attestation to contribute only its approved, exact-event ordering edges to replay. Normal ordering still comes from original `caused_by` references and journal-local order. `affected_scopes`, timestamps, and domain identities alone remain insufficient.
- Extend the current Construction rule against alternate predecessor lists only for this named recovery fact. Its payload asserts an order between existing records; it is not another list of direct causes of the new record or a generic relationship graph.
- Keep the ten-field envelope, original journal identities/order, scope guards, approval bindings, checkpoint retention, and unsupported-history behavior unchanged.

The existing [causality rules](runtime.md#causality-replay-and-reader-compatibility), [causal references](../../runtime.md#causal-references), and [journal order](../../runtime.md#journal-identity-and-order) do not currently grant this exception. This proposal must not be treated as a clarification that already authorizes it.

## Eligible case

The initial recovery operation is limited to the known Kepler 3.1.0 writer shape. All of these conditions must hold:

1. The caller selects an existing Standard unit in its canonical record home and one full lowercase UUIDv4 `revision_id`.
2. The complete collected Construction history is parseable and supported. The selected revision has exactly one valid version-2 `construction.revision-authorized` event with explicit affected scopes and its original supporting interaction/evidence.
3. Each target ending was produced by `kepler` version `3.1.0`, uses the supported version-1 Stage/Activity ending payload, directly names only that authorization as its cause, and identifies an exact `prior_attempt: present` scope in the authorization. There is at most one ending and one corresponding reopening for each affected occurrence.
4. An existing reopening, if present, already directly names the matching ending and authorization. The operation cannot repair a missing or invalid authorization, wrong attempt, wrong parent, duplicate transition, or malformed reopen pair.
5. The selected unit's blocking findings are ordering gaps involving eligible endings/reopenings and their exact affected scope transitions, or derivative transition findings in those same scopes caused solely by that missing order. An Implementation ending observed before its child start is one such derivative case. Every gap must be addressed by the proposed edges. Original records, authority, and bindings must validate independently; after applying only the permitted edges, tentative replay must leave no history/projection error in the selected unit or its required causal material. A diagnosis label alone cannot qualify an otherwise-invalid record.
6. The orchestrator has confirmed affected workers are terminal, reconciled repository/candidate/external effects, and established that no affected Integration lock or ownership uncertainty remains. No affected work continues during preview-to-apply coordination. The CLI verifies the lock state it owns; it records, but cannot independently certify, the host-worker attestation.
7. The requester explicitly approves the exact frozen recovery manifest before the CLI applies it. Authorization of the original revision, approval of an earlier design, or approval of this recovery contract is not that decision.

An unsupported producer/version, version-1 authorization without the captured scopes, incomplete source collection, corrupt bytes, missing cause, conflict, duplicate identity with different content, genuine unordered competing decision, or explicit opposite order is ineligible. Broader recovery requires a separately approved contract change. Preserve the material and report the condition; do not add a force option.

## Permitted ordering edges

Each edge has exactly two fields: `before_event_id` and `after_event_id`. Both are full, exact existing event identities, never prefixes or domain IDs. The edge means only: the requester-approved reconciliation attests that the first recorded scope transition precedes the second recorded ending in the recovered order.

| Target ending | Permitted predecessor |
| --- | --- |
| `construction.stage-attempt-ended-by-revision` | A state-transition fact from its exact affected stage attempt, including the last relevant start/wait/pause/resume/completion fact. |
| The same ending for Implementation | Also a state-transition fact from a child Activity attempt under that exact affected Implementation attempt. |
| `construction.activity-attempt-ended-by-revision` | A state-transition fact from its exact task, Activity, original Implementation parent, and Activity attempt. |

For each permitted exact stage/Activity attempt, the frontier is its latest non-revision lifecycle state-transition fact under original causal and journal-local order. Evidence, interactions, the target ending/reopening, and records from another attempt do not qualify. Each such scope must already have one unambiguous ordered state frontier; this operation cannot order two competing updates within it. If a frontier is missing, contradictory, or contains an unexplained late fact, recovery fails.

For each target ending, omit frontiers already ordered before it. Among the remaining frontiers for that ending, omit one that already precedes another remaining frontier: the latter's attested edge supplies the former's order transitively. The caller's proposed edge set must equal this complete, nonredundant frontier set. Computing candidates for preview does not establish their historical truth or grant replay edges. The requester and orchestrator must supply and review the basis for otherwise-unrecorded historical order; the CLI must not manufacture it from an attempt ID or clock.

Edges must stay inside the selected unit, revision's affected scopes, and phase. A child-Activity predecessor is allowed only for an affected Implementation ending. Self-edges, duplicate edges, edges to arbitrary starts/completions/approvals, cross-unit edges, edges already established by original order, and edges contradicting original paths are rejected. The proposed set must be the complete minimal frontier set needed for this defect, with no redundant transitive edges.

The operation must not reorder checks, acceptances, approvals, competing revision decisions, or another recovery. Reopenings acquire order through their original ending/authorization dependencies; no edge directly targeting a reopening is necessary or allowed.

## Proposed CLI contract

The following command is proposed, not currently available:

```text
kepler workflow construction recover-revision-order
  --unit <unit-id> --revision <revision-id> --project <record-home>
```

The command reads exactly one strict JSON object from stdin. Unknown fields, duplicate JSON keys, extra JSON values, partial identities, and mixed scope selectors are invalid. `--unit` and `--revision` are required; normal explicit project-selection rules apply to `--project`. The revision's recorded authorization supplies the exact root stage/Activity and prior attempt bindings. The caller cannot retarget them.

### Preview request

Required fields:

| Field | Meaning |
| --- | --- |
| `phase` | Literal `preview`. No durable write or live ownership change. |
| `requester` | The requester who will review this manifest; a non-empty attribution string, not authentication. |
| `ordering_edges` | Non-empty unique array of proposed exact-event edges. The caller supplies the reconciled assertion; the CLI validates its limited applicability. |
| `reconciliation` | The orchestrator's identity, terminal-worker/effect/lock attestations, exact run references when any were dispatched, non-empty supporting references, and a concrete ordering basis. |

`reconciliation` has exactly `orchestrator`, `affected_workers_terminal`, `effects_reconciled`, `integration_lock_reconciled`, `run_references`, `references`, and `ordering_basis`. The three attestations must be `true`. `references` uses non-empty `{ "reference", "purpose" }` pairs; reference strings remain opaque under the shared material-reference contract. `run_references` can be empty only when the stated basis confirms that no affected worker was dispatched. A missing worker, silent session, or elapsed deadline is not terminal proof.

The CLI validates eligibility and tentative replay, then returns the complete frozen manifest, `manifest_digest`, resolved scope/edge descriptions, before/after findings, and `execution_started: false`. Preview must not append events, allocate a recovery attempt, initialize a home, dispatch workers, take over a lock, or change the mission. A successful preview establishes technical applicability, not the truth of a host attestation or requester approval.

### Frozen manifest

The manifest has these fields:

| Field | Binding |
| --- | --- |
| `format`, `version` | Literals `kepler-revision-order-recovery` and `1`. |
| `mission_id`, `unit_id`, `revision_id` | Exact existing identities resolved from the selected record home. |
| `authorization_event_id` | The one valid original authorization for this revision. |
| `journal_prefixes` | Complete input-journal inventory: phase, original journal identity, exact byte length, and SHA-256 content version of the input prefix. At preview, each prefix is the entire complete current journal. |
| `ordering_edges` | The validated exact edges, sorted by `before_event_id`, then `after_event_id`. |
| `requester`, `reconciliation` | The exact preview attribution and attested facts, including references and ordering basis. |

A journal-prefix entry has exactly `phase`, `journal_id`, `byte_length`, and `content_version`; the phase is `construction`, length is a non-negative safe integer, and the content version is `sha256:` followed by 64 lowercase hexadecimal characters. Duplicate logical journal entries are invalid. The CLI must verify complete, consistent collection, including required causal material; the caller cannot omit an inconvenient source. Conflicting or ambiguous copies of a logical journal are ineligible. No absolute local path, timestamp-based order, or second source registry is required.

Use the existing Construction canonical-JSON convention: recursively sort object keys, serialize JSON primitives without whitespace or Unicode normalization, and preserve array order. Before serialization, sort `journal_prefixes` by phase/journal identity and `ordering_edges` as specified; preserve the exact order and content of reconciliation reference arrays. `manifest_digest` is `sha256:` plus the SHA-256 of those canonical UTF-8 bytes. No recording timestamp or newly allocated event ID belongs in the manifest. Equivalent object key order produces the same digest; any material, identity, reference, array order, edge, or attestation change requires a new preview and approval.

The CLI returns the manifest itself for review. A hash alone does not retain the original journals or external reconciliation evidence. Keep those inputs available under the existing retention and handoff rules.

### Apply request and approval

An apply request repeats the exact preview fields, changes `phase` to `apply`, and adds `approved_manifest_digest` and `decision_reference`. The decision reference identifies the requester's explicit approval of that manifest's exact scopes, journal prefixes, edges, and reconciliation basis. The CLI records requester attribution; it does not authenticate a conversation or obtain consent itself.

For a new application, the CLI takes existing short unit-scoped coordination, checks the original barrier and live ownership, recollects complete history, and independently rebuilds the manifest. Its digest and complete source inventory must equal the approved preview. Any new or changed input, selected edge, worker/effect uncertainty, or held/uncertain affected Integration lock aborts without a new approval or attestation event. The CLI must not truncate or alter a journal to recreate the preview.

Under that coordination, the CLI validates all guards again and appends one existing `construction.interaction-recorded` fact for the explicit manifest approval, then one `construction.revision-order-attested` fact directly caused by that interaction, the original revision authorization, and every edge endpoint. These causes state that the old facts were available before the new attestation; they do not pretend to be the missing historical edge.

The approval interaction retains strict JSON `content` with `operation: "recover-revision-order"`, the full `manifest`, `manifest_digest`, `requester`, and `decision_reference`. It names the requester and orchestrator as participants and is directly caused by the original authorization and the approved edge endpoints. This retains the actual approved snapshot if only the first append completes; the digest alone cannot reconstruct it. The interaction still supplies no recovery-order edge until the matching attestation validates.

### Examples of request serialization

These synthetic requests illustrate field shape only. The identities and digest are not real recovery evidence or approval; do not apply them to a mission. Supporting references must identify retained actual reconciliation material in a real request.

```json
{
  "phase": "preview",
  "requester": "Requester",
  "ordering_edges": [
    {
      "before_event_id": "10000000-0000-4000-8000-000000000001",
      "after_event_id": "10000000-0000-4000-8000-000000000002"
    }
  ],
  "reconciliation": {
    "orchestrator": "agent:orchestrator",
    "affected_workers_terminal": true,
    "effects_reconciled": true,
    "integration_lock_reconciled": true,
    "run_references": [],
    "references": [
      { "reference": "report:revision-reconciliation", "purpose": "Retained scope and ordering reconciliation" }
    ],
    "ordering_basis": "No affected worker was dispatched; the retained report establishes the exact predecessor before the old ending."
  }
}
```

```json
{
  "phase": "apply",
  "requester": "Requester",
  "ordering_edges": [
    {
      "before_event_id": "10000000-0000-4000-8000-000000000001",
      "after_event_id": "10000000-0000-4000-8000-000000000002"
    }
  ],
  "reconciliation": {
    "orchestrator": "agent:orchestrator",
    "affected_workers_terminal": true,
    "effects_reconciled": true,
    "integration_lock_reconciled": true,
    "run_references": [],
    "references": [
      { "reference": "report:revision-reconciliation", "purpose": "Retained scope and ordering reconciliation" }
    ],
    "ordering_basis": "No affected worker was dispatched; the retained report establishes the exact predecessor before the old ending."
  },
  "approved_manifest_digest": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "decision_reference": "conversation:requester-approved-the-exact-preview-manifest"
}
```

## Proposed event and replay behavior

`construction.revision-order-attested`, event version `1`, uses the unchanged ten-field Construction envelope. Its `data` has exactly `mission_id`, `unit_id`, `revision_id`, `authorization_event_id`, `manifest`, `manifest_digest`, `requester`, and `decision_reference`. Duplicated top-level identities/attribution must equal the manifest. The full manifest is retained in this event; no independently authoritative recovery sidecar or new `recovery_id` is introduced.

Replay must validate the original records first, without using the proposed extra edges to make an otherwise-invalid authorization or approval valid. It then validates the unique attestation, original authorization and direct approval interaction, source-prefix bindings, exact scope/frontier/edge restrictions, and digest. Eligibility and frontier checks use the bound original prefixes, excluding the new approval/attestation and later appends; every edge endpoint and its required original authority must occur in those prefixes. All later records still undergo normal validation against the full current graph. The original graph plus only the valid attested edges must be acyclic and satisfy every normal guard. A recovery cannot establish its own authority, rescue a conflicting decision, or hide another unsupported/invalid record.

A supporting approval interaction alone contributes no historical order. Duplicate or conflicting attestations for the same original revision block recovery; an identical retry must return the one original receipt instead of appending another. An older reader that does not support this required event must preserve its bytes and block the affected scope, never ignore it. Applying recovery therefore requires an intentionally selected compatible reader; contract approval does not install one or alter the host's versioned-resource binding.

After the new fact is validated, queries can show the state already established by the original ending/reopening events, with the attestation event and edges exposed as their recovery-order provenance. They must not claim that the old `caused_by` lists changed. If a normal revision transition is still missing, the barrier remains pending and only the original authorized `revise` request may finish it through its normal guards.

Apply does not append missing lifecycle endings/reopenings, start a replacement attempt, execute a stage, restore a lock, rerun checks, reapprove changed artifacts, or complete a workflow. Existing design/quality evidence stays historical where the original revision invalidated it. Every reopened stage still follows the accepted revision cascade and its own approval/completion conditions.

## Concurrency, retry, and partial writes

- Keep the existing revision barrier in effect. Hold short unit-scoped coordination for the final input check and journal append, not while workers stop, a requester reviews, or checks execute. Never force-release or take over an Integration claim.
- Allocate new event/journal identities only for the new approval and attestation facts. Preserve every original event, producer, identity, byte sequence, and relative journal order. Do not add corrected duplicates of old lifecycle facts.
- On an identical retry, first locate the original operation by unit/revision, approved manifest digest, and exact request attribution/decision/reference content. Verify the existing receipt, original bound prefixes and full current history before acknowledging it. An already recorded matching receipt may coexist with later valid journal appends; the retry must not require today's entire collection to equal the old preview.
- A new apply with no matching receipt requires the exact frozen source inventory. A retry of an existing receipt verifies the original byte prefixes using their lengths and digests. Valid later appends do not rewrite those prefixes or their approved meaning. Missing or changed original prefixes, contradictory duplicates, or an incompatible later fact prevent a success claim.
- Before the first append, retain the exact original pending approval/attestation envelopes, including their allocated IDs, producer, timestamp, journal, causes, manifest, and bindings, through recoverable write intent. Such local pending intent is not authoritative history and grants no recovery order. This contract selects no new storage path or separate state authority; if the original pending envelope cannot be retained or recovered, the operation must not promise automatic completion after interruption.
- Follow [SH87 interrupted-write recovery](../../runtime.md#interrupted-event-write-recovery). Preserve complete canonical approval/attestation records and damaged/uncertain bytes. Reuse exact retained pending envelopes and original IDs where a write may already have happened; do not allocate replacements to conceal uncertainty. If only the approval interaction is durably complete, a reconciled identical retry may append only the missing original attestation. If original identity/envelope or completeness cannot be established, keep the operation blocked.
- The CLI must validate the resulting projection before reporting recovery success. A release failure, uncertain append, or failed reread reports the exact new record identities and partial effects. A nonzero exit never implies that no event was appended.

Success returns the original revision and manifest digest, the approval/attestation event identities, whether it is an idempotent retry, the derived barrier status, and `execution_started: false`. It reports only ordering recovery, not completion of the revision cascade or readiness of a successor stage. Use the existing structured JSON result envelope and exit-code/error conventions; do not create a force/human-output bypass.

## Verification obligations for a later implementation

| Scenario | Required evidence |
| --- | --- |
| Known 3.1.0 Stage and Activity ending omissions in separate journals, including an Implementation parent with children | Unit and real-journal integration evidence that the approved narrow attestation restores only the missing order and leaves all original file prefixes unchanged. |
| Shared ancestor, attempt IDs, or timestamps without an attestation | Existing unordered-history failure remains; no inferred edge or hidden fallback. |
| Wrong unit/revision/attempt/parent, `prior_attempt: none`, unsupported producer/version, malformed/duplicate authorization or reopen, unknown endpoint, extra/redundant edge, ambiguous frontier, cycle/opposite order | Reject before a new approval/attestation write; preserve all original material. |
| Preview, changed source/manifest/attestation after preview, missing explicit manifest approval, live worker/lock uncertainty | Preview is read-only; changed or unauthorized apply fails without recovery writes. |
| Successful apply, exact retry, partial append/uncertain outcome, valid later appends | One original receipt, retained identities, no duplicate lifecycle events, verified historical prefixes, and truthful partial-effect reporting. |
| Restart/export/import under a compatible reader; unsupported old reader | Replay retains attestation provenance and requires its original bound material; unsupported readers fail closed. Do not claim every export/import mechanism is implemented. |
| Public CLI recovery followed by the same original `revise` request and a new Functional Design attempt | Small isolated E2E workflow; Quality cannot advance until the revised design is approved/completed. No real user mission or host installation is a test fixture. |

Prioritize public-contract unit tests, fewer real integration checks, and a small CLI E2E case. Tests of metadata or example JSON do not prove the actual historical ordering or host-worker termination. This draft adds no benchmark, smoke suite, real-model evaluation, or agent certification requirement.

## Alternatives and decisions requested

| Alternative | Assessment |
| --- | --- |
| Infer order from `affected_scopes`, timestamps, or a common ancestor | Reject: identifies a target or a clock value, not an explicit event-order assertion; can hide genuine late or conflicting facts. |
| Rewrite old `caused_by`, delete transitions, add corrected lifecycle duplicates, or replace the mission | Reject: changes provenance or evades the affected state instead of recovering it. |
| Generic event-order editing, force-unblock, or automatic recovery whenever replay fails | Reject: broader authority than the demonstrated writer defect and no reliable boundary against unrelated conflicts. |
| Narrow append-only approved ordering attestation with frozen inputs | Proposed: preserves old bytes, records the new claim and its authority explicitly, and keeps all normal scope, integrity, and replay guards. It requires a new supported contract/reader and does not independently prove a human/host attestation. |
| Leave existing affected histories blocked and ship only the writer fix | Safe existing behavior; the original unit cannot resume until a supported recovery is approved and implemented. |

Requester approval is requested for the narrow eligibility/version scope, the new replay-order exception and event, the preview/apply operation, exact frozen-manifest approval, and the fail-closed retry/retention rules. There is no remaining unspecified product choice within this proposal; implementation must stop and request a contract revision if these constraints cannot be met. Architecture, storage adapters, shared helper extraction, error-code spelling, release version, and host rollout remain separate implementation/release decisions.

No accepted specification file, live journal, stage artifact, host setting, or PR #58 implementation is changed by this draft. After contract approval, request explicit implementation authority; before applying a future compatible operation, obtain approval of that mission's actual frozen recovery manifest and the necessary execution/version-selection authority.
