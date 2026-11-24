# Recovery client compatibility evidence

This reference records Amendment A of SH128 for generation-based mission history. The verifier checks retained bytes, bindings, scope, and consistency. It does not query worker-control backends, authenticate a lead, detect undeclared processes, or prove that a client actually honors its stated classification.

## Supported client protocol

A client is supported only when its actual build or adapter implements all of these requirements under `mission-history-generations/v1`:

1. Select and validate the active history control before loading phase journals.
2. Read only the selected generation as current workflow authority.
3. Carry the caller's captured explicit history version on every ordinary mutation; never rewrite an old request to the current version.
4. Hold the mission fence across the entire mutation, including non-journal effects, and check ownership and selection as required by the accepted contract.
5. Prevent ordinary dispatch while recovery is pending, history is recovering or unavailable, or migration is required.
6. Join a working copy through verified preparation before it writes; a copied local selector alone cannot restore authority to a stale or transferred copy.

A software version, executable name, context reference, or capability claim alone does not establish support. Retain evidence for the actual client build or adapter in use. The pinned legacy Kepler 3.1.0 build at `d2a9f5037c227765818e220443f426303bef4b45` is unsupported for generation-based history. Do not classify every build labelled 3.1.0 from its version string. This evidence contract does not change the source version or select a release minimum. Before a production release, its policy must name the minimum supported released client version and identify the actual builds or adapters that satisfy this protocol.

The Section 10 control guard remains at its accepted location and format. It informs clients that understand the generation protocol; it does not guarantee that an older executable will reject the repository. An unsupported executable may still show an incorrect empty projection or append deprecated direct phase journals when invoked. Kepler must not describe such an executable as fenced, repaired, or safe because the new guard exists. Unsupported-client writes do not become current generation authority.

## Operational gate

Before migration, reset activation, or reconstruction publication, the lead must:

1. Inventory affected interactive clients, workers, automations, SDK adapters, and known working copies in the operation's scope, including stopped and offline copies that could later resume.
2. Establish support from evidence for each actual build or adapter. Unknown clients are not supported.
3. Stop incompatible and unverified clients through their supported controls. Confirm affected runs are terminal and reconcile their effects using the existing lead report.
4. Keep offline or stale copies stopped until they upgrade and complete verified preparation against the selected history version. Ensure only compatible clients can resume or join after publication.
5. Retain inventory, confirmations, and supporting material, and confirm that no unresolved client remains in scope.

The report's unique affected run references define the required run set. The required working-copy origin set is the union of the freshly resolved repository-context origins, known unavailable origin IDs, and strict prior membership retained in approved inputs. During apply or resumed publication, use the exact original selector bytes retained by the operation intent; do not treat the producer's newly published membership as the prior membership. Missing-selector reset support and exact declared bound-loss retries retain their existing contracts.

A client associated with any affected run must be stopped; the lead report independently confirms the run's terminal state and reconciled effects. A compatible client may be stopped. Only a compatible client may be `active-read-only`, and it cannot be associated with an affected run. A stopped unverified client with a null identity is distinct from a compatible stopped client and does not authorize resumption.

For a known quiescent copy, use kind `quiescent-copy`, no run references, `unverified`, `stopped`, and a null client identity. Associate at least one required origin ID or declare its reference in `external_client_references`. An external reference identifies the copy; it is not a fabricated physical origin and grants no membership or write authority. A copy whose stopped state cannot be confirmed remains unresolved and blocks eligibility.

## Retained document

The operation's lead report retains exactly one material with purpose `history-client-compatibility`, and that reference is also scope evidence. Its bytes are one strict JSON object in format `kepler.history-client-compatibility`, version `1`, with exactly these top-level fields:

- `mission_binding`: the exact operation binding, including record-home repository, mission ID, workflow, request reference, and known unit IDs.
- `generation_id`, `operation`, and `required_protocol`: the operation target, one of `migrate`, `reset`, or `publish`, and `mission-history-generations/v1`.
- `confirmed_by` and `scope_complete`: the lead named by the report and its explicit affected-scope completeness statement.
- `external_client_references`: unique additional client or working-copy references not identified by the run and origin sets.
- `clients`: a nonempty list, unique by actual client-instance or copy `reference`.
- `unresolved_clients`: an empty array.
- `source_material`: a nonempty set of unique supporting references and exact SHA-256 content versions.

Each client entry has exactly `reference`, `kind`, `run_references`, `origin_ids`, `protocol_status`, `operational_state`, `client_identity`, and `evidence`. Kinds are `interactive`, `worker`, `automation`, `sdk`, or `quiescent-copy`; protocol statuses are `compatible`, `incompatible`, or `unverified`; operational states are `stopped` or `active-read-only`. References and associations are unique within their respective lists. A known identity names a specific build or adapter. An explicit unknown/null placeholder or bare version label is not a known build identity. Use null only for an unverified stopped entry; it grants no resumption authority. Each entry has nonempty evidence, and each evidence item resolves to a source-material item with the same exact hash.

The union of client run references equals the report's affected run set. The union of origin IDs equals the required working-copy origin set. Associations outside these sets are invalid. Every external reference identifies exactly one entry. Every entry is associated with a required run, a required origin, or an external reference. An external client reference can coexist with known run or origin associations; those associations still must satisfy the exact coverage sets.

Each `source_material` item appears exactly once in the report materials with the same hash, a nonblank purpose, and a scope-evidence use. The compatibility document appears exactly once in report materials with its actual content hash and is scope evidence. It cannot cite itself or the lead report as source material. For reset and publication, the manifest's existing reconciliation references remain exactly the lead report plus its materials, with their purposes. For publication, the existing required evidence binds the report and each material by hash.

Migration initialization has no `reconciliation.references` field. Keep its fixed lead-report path and bind the report, compatibility document, and supporting bytes through the approved source inventory; do not add an initialization-manifest field. Construct supporting source material first, then the compatibility document, then the lead report, then the manifest. Do not create self-hashes or a cycle through the publication manifest.

## Apply, retry, and limits

A preview may identify a missing or invalid gate, but it cannot mark the operation eligible. Apply and resumed publication must validate the gate before unauthorized effects. The lead must repeat the real client-state check before apply or resumed publication: unchanged evidence bytes do not establish that a stopped client stayed stopped. Kepler validates retained statements and hashes; it cannot detect an unsupported process restarted outside its controls or confirm external observations.

An exact completed historical retry that only verifies and reports its existing receipt performs no new activation. It must not stop later valid work or reactivate an old selection. Ordinary selected-history reads and verified joins do not re-evaluate old origin membership or require a local old archive merely to repeat this compatibility check. Initial generation publication retains the accepted Section 10 compatibility condition and gains no new startup request or initialization-manifest field.
