# Artifacts

[Reference index](README.md) | Previous: [Gates](gates.md) | Next: [Reference maintenance](maintenance.md)

## Paths and ownership

Here, `<effort>` means `.kepler/maps/<effort-name>/`. The undated slug identifies the effort; numbered ticket files identify its decision questions.

Installed templates live under `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/`. Templates guide new files; lint validates supported existing format.

| Artifact | Producer and permitted writer | Inputs and purpose | Consumers and output contract |
| --- | --- | --- | --- |
| `<effort>/map.md` | Wayfinder owner; bound downstream owners update permitted aggregate shipment state. | Destination, Notes, Operation rules, summaries, fog, and exclusions orient sessions. | Ticket work and closure use the index. It links answers rather than storing full decisions. |
| `<effort>/tickets/NN-slug.md` | Authorized ticket owner; Wayfinder owner integrates results and supersession. | One precise question, type, and blockers define bounded decision work. | Answer holds current truth and reasoning; Outdated decisions preserves superseded answers with links. |
| `<effort>/research/<name>.md` | Assigned background researcher. | Primary-source investigation supports one question. | Ticket owner assesses cited findings and links them from the ticket. These notes are outside Kepler lint. |
| `<effort>/glossary.md` | Current effort's language owner. | Resolved scoped terms, aliases, and sources record working language. | Closure compares and folds confirmed meanings. The working glossary is not a recognized Kepler artifact. |
| `.kepler/specs/glossary.md` | Init owner, authorized domain-modeling owner, or Wayfinder closing operation. | Requester-confirmed terms define canonical vocabulary. | All phases use scoped meanings. Preserve existing author, content, format, and source evidence. |
| Prototype files on `prototype/...` | Assigned prototype owner. | One design question determines disposable evidence. | Requester validates observations. Retain a reachable branch pointer; do not deliver throwaway code as production. |
| `<effort>/route.md` body | Wayfinder owner at closure; later corrections need decision-owner authority. | Current answers and destination produce the static delivery contract. | Construction consumes outcomes, constraints, target, qualification, and units without reconstructing the map. |
| `<effort>/route.md` unit state | Bound change owner starts its unit; finish owner records qualifying shipment. | Exact owner/unit binding and observed effects support lifecycle updates. | Update only the named unit. Preserve sibling metadata and synthesized body. |
| Construction proposal, plan, and finish records | Their construction owners. | Exact route/unit binding links the change to its delivery outcome. | Preserve route identity and evidence through planning, execution, and finish. See [construction artifacts](../phase_construction/artifacts.md). |

Ownership is a workflow obligation, not a new `owner` field on tickets or route units. The current schemas do not encode a claim timestamp or expiry.

## Stored metadata

| Artifact | Identity and required context | Lifecycle values | Other required fields |
| --- | --- | --- | --- |
| Map | `artifact: map`, `effort`, `branch` | `status: open`, `cleared`, `shipping`, `shipped` | `created`, `updated`, `decision` |
| Ticket | `artifact: ticket`, `effort`, positive integer `ticket`, `type` | `status: open`, `claimed`, `resolved` | `blocked_by`, `created`, `updated`, `decision` |
| Route | `artifact: route`, `effort`, `units` | `status: open`, `shipping`, `shipped` | `created`, `updated`, `decision` |
| Route unit | Positive integer `id`, exact `name` | `status: pending`, `in-progress`, `shipped` | `depends_on`, `backed_by` |

Ticket `type` is `research`, `prototype`, `grilling`, or `task`. `blocked_by` contains ticket numbers.

The three Wayfinder artifacts use `decision: accepted`, `rejected`, or `skipped`. This field does not replace explicit authorization or a supported Answer.

A map's `branch` is its working and merge-back branch. Current lint requires it; the historical fallback wording has a [documented mismatch](maintenance.md#known-source-gaps).

A route has no `cleared` status. Its aggregate status procedure is not fully specified; do not invent one from the map lifecycle.

## Body contracts

| Artifact | Body structure | Evidence contract |
| --- | --- | --- |
| Map | Destination; Notes; Operation rules; Decisions so far; Not yet specified; Out of scope. | Keep rules separate from descriptive context and answers separate from summaries. |
| Ticket | Question; Answer; Outdated decisions. | Answer states current decision and reason; evidence pointers retain research or prototype context. |
| Route | Point of departure; Destination; Path chosen; Shipping rules; Units. | Self-contained outcome and causal choices; detailed history remains in tickets. |
| Working glossary | Domain-modeling glossary format. | Context-scoped terms, meanings, aliases, and sources; no production behavior or architecture decisions. |
| Canonical glossary | Existing canonical format, or installed template on creation. | Requirements-spec metadata with configured author attribution and current vocabulary. |

Route unit headings use `### N. Name`. Frontmatter IDs, names, and order match the headings exactly.

Unit metadata owns dependencies and backing ticket paths. The unit body supplies contribution, observable completion outcomes, and binding constraints.

Extra lint-valid route sections are permitted. Do not treat the installed template as a second validator for existing artifacts.

## Cross-phase binding

The stored binding is `route_unit: .kepler/maps/<effort>/route.md — unit N`, or `null` for an unbound change.

Proposal, design, and plan templates carry that field. Context resolves proposal and plan bindings; a non-null conflict prevents an unambiguous handoff.

The emitted `route-unit-revision` is a route blob identity. It does not authenticate the owner or prove that prerequisites have reached the target.

Modern finish records preserve route path, map path, unit, source blob, previous in-progress state, shipping condition, owner/change, source/target refs, and base commit.

These records bind observed finalization evidence. They do not create authority to alter another unit or rewrite the route destination.

## Workbench operation contracts

| Operation | Responsibility | Input → output | Write boundary and limit |
| --- | --- | --- | --- |
| `kepler workbench lint --file <path>` | Validate one recognized artifact. | Regular file → diagnostics and exit code. | No ticket selection, semantic approval, or shipment inference. |
| `kepler workbench lint --change-dir <dir>` | Recursively inspect files under one directory. | Directory → recognized-artifact findings; unrelated outputs remain outside contracts. | Exactly one file or directory scope. No cross-file ticket scheduler. |
| `kepler workbench context <change-dir>` | Project current change and route evidence. | Proposal/plan binding and committed route → unit identity and route blob revision. | It does not prove unit eligibility, ownership, dependency reachability, or map branch policy. Legacy-path resolution can copy data. |
| `kepler workbench prototype <map> <ticket>` | Create or resume a map-ticket prototype branch. | Exact slugs and repository → switched branch and mode. | No ticket claim, answer, or resolution mutation. |
| `kepler workbench prototype --standalone <question>` | Create or resume standalone throwaway work. | Question slug → prototype branch. | No map creation required. |
| `kepler workbench prototype --verify <branch>` | Check expected prototype branch. | Exact branch → verification result. | Does not commit work or return to the starting branch. |
| `kepler workbench precondition` | Check construction finish readiness or finalization repair. | Change and explicit finish inputs → readiness evidence. | Ordinary readiness is not automatic enforcement of all route ownership or admission policy. |

No CLI `map`, `ticket`, or `route` transition command exists. Skills and responsible owners perform the file-native work.

## Lint boundary

| Area | CLI checks | Owner checks beyond lint |
| --- | --- | --- |
| Metadata | Required fields, types, allowed values, and YAML validity. | Current truth, requester authority, and complete evidence. |
| Body | Required titles and sections. | Answer quality, consistency, and destination clarity. |
| Route units | Identity parity, unique IDs, valid dependency references, and acyclic graph. | Causal order, destination coverage, target reachability, and actual shipment. |
| Ticket blockers | Positive integer list. | Actual ticket existence, coherent blocking relations, and resolved prerequisite evidence. |
| Backing tickets | Nonempty path strings. | Correct path identity, file existence, and relevant decision evidence. |

Successful lint returns zero findings, not approval. A nonzero exit blocks the affected handoff or commit until correction or a precise blocker report.

Do not lint Markdown documentation as if it were a live map or ticket. This reference describes contracts; it does not create project execution artifacts.
