# Proposed recovery contract amendments

Status: **Proposed. Not approved for implementation.**

This proposal follows the requester's choices of compatible-client rollout and original request text preservation. Those choices authorize this draft only. Approval of this draft would amend the specified contract rules. It would not approve a live operation, a release, installation, activation, a version change, a merge, or a change to the Sagittarius mission.

## Approval boundary

The accepted source is `docs/specs/v3/mission-history-reset-recovery.md` at `c3027935a54b0536216b3dedae97696f3204e7fa`, with original SHA-256 `5caa137ab3522f4bd0afdd66e15260e6d4ec408cfb4acd097f8b48992cf087ee` and implementation-only approval SH127. This proposal leaves those bytes unchanged.

The two amendments below are independent of the checkpoint/material and known-unit membership corrections already permitted by that contract. All other preservation, archive, ownership, fencing, exact approval, pending-intent, retry, causality, and provider-neutral evidence requirements remain in force.

## Amendment A: compatible-client boundary

### A1. Supported clients

A client is supported for generation-based mission history only if it implements all of the following:

1. It selects and validates the active history control before it loads phase journals.
2. It reads only the selected generation as current workflow authority.
3. Each ordinary mutation carries the caller's captured explicit history version. The client does not replace an old request's version with the current version.
4. The mission fence covers the whole mutation, including non-journal effects. The client checks ownership and selection as required by the accepted contract.
5. Pending recovery, recovering history, unavailable history, and migration-required history prevent ordinary dispatch.
6. A working copy joins current history through the verified preparation path before it can write. Stale or transferred copies cannot regain authority from a copied local selector alone.

These requirements define history protocol `mission-history-generations/v1`. A version string, executable name, context reference, or capability claim alone is not proof of support. The operator or lead MUST use evidence for the actual client build or adapter in use.

The pinned legacy Kepler 3.1.0 client at `d2a9f5037c227765818e220443f426303bef4b45` is not supported for generation-based history. Another build with the same software version MUST NOT be classified from that version string alone. This amendment does not bump the current source version. Before a production release, its release policy MUST name the minimum supported released client version and identify the builds/adapters that satisfy this protocol.

### A2. Legacy-client limits

The Section 10 control guard remains at its accepted location and retains its accepted format. It identifies the required generation protocol to clients that understand it. It is not a guarantee that an older executable will reject the repository.

Unsupported clients can return an incorrect empty projection or append deprecated direct phase journals if an operator invokes them. Kepler MUST NOT describe those executables as fenced, repaired, or safe because a new control guard exists. Writes by unsupported clients MUST NOT become current generation authority.

This amendment does not introduce a legacy-visible marker, a second writable history layout, a force option, a takeover command, or a public join command.

### A3. Required operational gate

Before migration, reset activation, or reconstruction publication, the lead MUST:

1. Inventory the affected interactive clients, workers, automations, SDK adapters, and known working copies within the operation's scope.
2. Establish which actual clients satisfy the supported protocol. An unknown client is not a supported client.
3. Stop incompatible and unverified clients through their supported controls. Confirm that affected writers are terminal and reconcile their effects under the existing lead-reconciliation contract.
4. Ensure that only compatible clients will resume or join after publication. Keep offline or stale copies stopped until they upgrade and complete verified preparation against the selected history version.
5. Retain the inventory, confirmations, and supporting material, and confirm that no unresolved client remains in the affected scope.

Here, clients means affected ordinary workflow readers and writers. The recovery control process is not an ordinary workflow client, but it MUST itself use a recovery-capable implementation. The inventory MUST cover every affected run reference and every known affected working copy, including stopped or offline copies that could later resume.

The required run set is the unique set of affected run references in the existing reconciliation report. The required working-copy origin set is the union of origin IDs in the freshly resolved history repository context (including known unavailable origins) and any strict prior membership binding retained in the approved inputs. An unreadable or unsafe origin remains subject to the existing blocking rules. Compatibility inventory does not turn an unjoined copy into a missing history source or authorize removal of a member. The lead MUST also declare an external reference for every known affected client or working copy that these sets do not identify, with retained scope evidence. An external copy reference identifies that copy; it is not a fabricated physical origin ID and grants no membership or write authority.

Initial generation publication remains subject to the accepted Section 10 compatibility condition. The recovery evidence gate in A3–A4 adds no new startup-request or initialization-manifest field.

The lead remains responsible for the completeness and truth of these external observations, including the externally declared client set. Kepler validates retained bytes, explicit statements, scope, and consistency. It does not gain a backend-specific worker-control dependency, authenticate a person from a label, or claim to detect every process outside the declared scope.

### A4. Compatibility evidence

The operation's retained lead report MUST contain exactly one material with purpose `history-client-compatibility`. For reset and publication, that reference MUST also occur in the manifest's existing reconciliation references. Migration initialization has no `reconciliation.references` field: it uses the existing fixed lead-report location, with the report, compatibility document, and supporting bytes bound by its approved source inventory. This amendment does not add a field to the initialization manifest. The material MUST resolve through the existing closed snapshot-reference mechanism to one strict JSON document with these fields:

| Field | Required value or meaning |
| --- | --- |
| `format` | `kepler.history-client-compatibility` |
| `version` | `1` |
| `mission_binding` | The exact selected operation's mission binding, including record home, mission ID, workflow, request reference, and known unit IDs. |
| `generation_id` | The operation's target generation. |
| `operation` | `migrate`, `reset`, or `publish`. |
| `required_protocol` | `mission-history-generations/v1`. |
| `confirmed_by` | The lead named by the operation's reconciliation report. |
| `scope_complete` | `true`, an explicit lead statement about the declared affected scope. |
| `external_client_references` | A unique list of the additional affected client or working-copy references declared by the lead under A3. It can be empty. |
| `clients` | A nonempty list of client or quiescent-copy entries defined below, unique by `reference`. The record-home origin is always in scope. |
| `unresolved_clients` | An empty array. Any unresolved observation blocks eligibility. |
| `source_material` | A nonempty list of unique material references and their exact content hashes supporting the inventory, classifications, and confirmations. |

Each entry has exactly these fields:

- `reference`: a nonblank identifier for one actual client instance, adapter, or quiescent copy. It is not an ambiguous client-or-run shorthand.
- `kind`: `interactive`, `worker`, `automation`, `sdk`, or `quiescent-copy`.
- `run_references`: a unique list of affected run references associated with this entry.
- `origin_ids`: a unique list of affected working-copy origin IDs associated with this entry.
- `protocol_status`: `compatible`, `incompatible`, or `unverified`.
- `operational_state`: `stopped` or `active-read-only`.
- `client_identity`: the nonblank actual build/adapter identity, or `null` only for an unverified, stopped entry. This is attribution, not authentication.
- `evidence`: a nonempty list of unique material references and exact content hashes.

A compatible client can be stopped. `protocol_status` classifies its implementation; `operational_state` states its observed disposition. Only a compatible entry can be `active-read-only`. Every entry associated with a run in the reconciliation report MUST be stopped, and the existing report MUST independently confirm that run's terminal state and reconciled effects. A specific build identity and supporting evidence are required for compatibility; a version string or an unknown identity cannot authorize resumption.

A `quiescent-copy` entry represents a known copy for which the lead confirms that no ordinary client is running. It MUST have no run references, `protocol_status: unverified`, `operational_state: stopped`, and `client_identity: null`. It MUST have at least one required working-copy origin ID, or its `reference` MUST occur in `external_client_references`. In the latter case, `origin_ids` can be empty: retained scope evidence identifies the external copy without inventing a resolver origin. This explicitly covers known stale or offline copies outside the resolver and prior membership sets. The entry does not claim to identify an executable or grant resumption permission. An offline copy whose state cannot be confirmed remains unresolved and blocks eligibility. An actual compatible client and verified preparation are still required before use.

For exact coverage, the union of all `run_references` MUST equal the required A3 run set, and the union of all `origin_ids` MUST equal the required A3 working-copy set. References outside those sets are invalid. Each `external_client_references` value MUST equal exactly one entry's `reference`. Every entry MUST have a run association, an origin association, or that external-client declaration. One client associated with several runs or origins uses one entry with those associations. Several clients on one origin use separate entries. These comparisons do not replace the lead's scope-completeness attestation.

The compatibility reference MUST appear exactly once with purpose `history-client-compatibility` in the lead report's `materials`, with the actual document hash. It MUST also occur in the report's `scope_evidence_references`. Each `source_material` item MUST appear exactly once in the report's `materials` with the same reference and hash, a nonblank purpose, and a scope-evidence use. Each entry's `evidence` item MUST resolve to one of those `source_material` items with the same hash. For reset and publication, the manifest reference list MUST continue to equal the lead-report reference plus all report materials, with their exact purposes. Migration retains the inventory binding stated above. For publication, the existing `required_material.evidence` MUST also bind the report and all those materials with identical hashes.

The document cannot list itself or the lead report as source material. It cannot contain a hash of the lead report or of a manifest that hashes this document. Construct source material first, then the compatibility document, then the lead report, then the manifest. Existing complete inventory, preservation, and exact self-inventory exclusions remain unchanged.

Kepler MUST reject duplicate keys, unknown fields, wrong operation/mission/generation/lead bindings, unknown origin assertions, incomplete scope coverage, invalid status/state combinations, unresolved clients, missing material, and changed hashes. A stopped incompatible or unverified entry records the lead's obligation to prevent resumption before upgrade and verified preparation. It does not claim that the old executable enforces that obligation.

A preview can report a missing or invalid gate, but it MUST NOT report the operation as eligible. Apply/publication MUST fail before unauthorized effects if the gate is absent or invalid. The lead MUST repeat the real client-state check before an apply or resumed publication; unchanged evidence bytes alone do not establish that a stopped client stayed stopped. Existing mission fences, exact intents, and retry guards remain required.

An exact completed historical retry that only verifies and reports an existing receipt performs no new activation. It MUST NOT stop later valid work or reactivate old selection. Existing receipt verification still applies; the receipt supplies no authority for a new operation.

## Amendment B: preserve original request text

### B1. Request invariant

Recovery MUST preserve the exact original request string in every candidate `construction.mission-created.data.request` fact. Comparison uses the decoded string value with no trimming, case change, whitespace normalization, newline conversion, or Unicode normalization.

The existing `request_reference` remains an identity binding. A matching event/context alias is not proof that a different request string is the original text. Generic action approval, clean-restart approval, matching names, references, or hashes MUST NOT substitute for the explicit preservation evidence defined here.

Recovery can correct a record of the request when the record is wrong. It cannot use that correction to authorize different actual work. Ordinary request/scope changes remain outside recovery authority.

### B2. Recoverable original text

Compilation MUST first examine the available, verified retained source for the bound original creation. It MUST use the supported owner schema and mission/request binding to identify the source. It MUST NOT search arbitrary opaque strings or treat a projection/cache as original request authority.

One valid creation record can establish the text even if other records are damaged, the old projection cannot load, or the journal has a damaged tail. No healthy whole-history projection is required. Malformed, ambiguous, unsupported, or unrelated records do not establish the text.

When the verified sources establish one original value, the candidate MUST preserve it unless a specific requester assertion identifies the conflicting recorded source as wrong under B3. If sources conflict, Kepler MUST report that conflict rather than select a value from timestamps, filenames, journal order, or an arbitrary preferred origin.

A reference string alone MUST NOT be guessed to be literal request text. If the original creation and other supported original-text evidence are unavailable, B3 applies even when the reference resembles an event ID or looks like readable text.

### B3. Explicit requester assertion

When original text is unavailable or conflicting records require correction, reconstruction MUST require one strict original-request assertion document. It MUST be bound in the existing `required_material.evidence` by reference and exact content hash. The document has exactly these fields:

| Field | Required value or meaning |
| --- | --- |
| `format` | `kepler.history-original-request` |
| `version` | `1` |
| `mission_binding` | The exact selected reset's mission binding. |
| `reset_event_id` | The selected reset event ID. |
| `generation_id` | The selected reset's generation ID. |
| `original_request` | The exact original request string asserted by the requester. |
| `requester` | The requester named by the reconstruction plan. |
| `decision_reference` | A nonblank reference to the specific retained requester decision. |
| `assertion` | `exact-original-request-unchanged`. |
| `source_material` | A nonempty list of material references and exact hashes containing the actual requester statement and any retained original-request evidence. |
| `conflicting_sources` | A unique list of exact conflicting creation occurrences, or an empty array. Each entry has `reference`, `content_version`, `source_id`, `byte_offset`, `byte_length`, and `event_id`. The reference/hash bind the complete retained source; `source_id` and the byte range use the accepted reconstruction source-range convention and identify one parsed creation occurrence with that event ID. |

The requester statement MUST say that the supplied text is the exact original request and that the actual work request is unchanged. `decision_reference` MUST identify the retained requester decision that makes that statement; a requester name or typed JSON assertion alone is not authentication. Approval of a submitted reconstruction or restart context, without that assertion, is insufficient. This policy approval does not supply that assertion for any real mission.

If the assertion differs from a readable recorded request, it MUST identify each conflicting known creation occurrence. Coverage compares source ID, whole-source hash, byte range, and event ID, so repeated event IDs in one journal remain distinguishable. The reconstruction MUST give those records their explicit preserve/replace/exclude dispositions under the accepted archive and authority rules. It MUST NOT hide the conflict or overwrite the original bytes.

The assertion is a requester statement, not cryptographic proof of historical truth. The existing requester-decision and source-material responsibilities remain in force. Kepler MUST verify its exact bytes, supported references, requester and reset scope, required-material hash, conflict coverage, and equality between the asserted string and every candidate creation fact.

Kepler MUST reject missing or conflicting assertions, duplicate keys, unknown fields, wrong bindings, changed source material, and a candidate string that differs from the established original. A missing assertion is a blocked reconstruction, not permission to invent text, replace the request with an alias, or mark prior work complete.

### B4. Publication and subsequent clients

The original-text check MUST run before a candidate is accepted and again during independent recompilation before publication. It is part of the existing material verification, whose carrier is `PreparedReconstruction.verification.material` in the checked compilation result. This amendment creates no third evidence-document or receipt format.

The material result's `reference` is a result marker, not standalone proof. Its binding comes from the same checked result's manifest (including reset, generation, and required-material hashes), exact candidate-journal metadata and bytes, and the material verifier invocation on those inputs. The existing `HistoryDrafts.verify` replay MUST rerun the original-text check and compare the independently compiled manifest and candidate files with the retained approved candidate before publication. A saved result marker cannot replace that check. The approved publication manifest and existing pending/completed operation records retain the publication binding; no candidate, evidence document, or result marker hashes itself.

Ordinary selected-history readers and verified joins MUST NOT acquire a new dependency on a local old archive merely to repeat this historical check. They retain the accepted selection, approved-prefix, current material, ownership, and fencing checks. Portable current evidence required by a reconstruction must still be available under its existing material contract; this amendment does not excuse missing required material.

A later valid unit creation or journal append MUST NOT cause the gateway to compare the complete current generation with the reset-time candidate. Known membership and original-text checks use the approved candidate boundary.

## Required verification before completion

The implementation and tests MUST establish all of the following:

- The actual pinned old 3.1.0 client is classified as unsupported. Its observed unsafe direct behavior remains a recorded limitation, not a passing old-binary rejection claim.
- Missing, unsupported, unknown, incomplete, wrong-scope, or changed-material compatibility evidence blocks eligibility/apply as appropriate before unauthorized effects. The tests MUST NOT claim that static evidence detects an unsupported client restarted outside Kepler's controls.
- Compatible-but-stopped clients and unknown-but-stopped clients have distinct valid representations. Unknown clients cannot authorize resumption. Multi-run/multi-origin associations, shared origins, externally declared quiescent copies without resolver origins, missing coverage, reference/hash closure, and invalid state combinations are checked.
- Only an actual compatible client can resume through the existing verified preparation path and captured-version fence.
- A changed request behind an unchanged context/event alias is rejected when the original is known.
- A genuinely lost original request is rejected without the specific assertion, and accepted with correctly bound exact requester evidence.
- Conflicting recorded requests require explicit coverage and preserved bytes. A generic action or restart approval does not suffice.
- Valid reconstruction remains possible without a healthy old projection. Current reads and legitimate joins still work without an unnecessary local old archive.
- Exact retry, later progress, known-unit membership, causal ordering, complete preservation, and current-owner material checks retain their existing guarantees.

## What approval would permit

Exact approval would permit implementing these two rules, their two evidence-document contracts, the required validators and capability/rollout documentation, and proportionate tests. It would not approve any particular original-request text, client inventory, operation manifest, recovery action on a live mission, source-version bump, release, installation, activation, merge, or modification of the original Sagittarius mission.
