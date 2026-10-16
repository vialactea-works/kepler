# Gates

[Reference index](README.md) | Previous: [Construction handoff](handoff.md) | Next: [Artifacts](artifacts.md)

## How to use these gates

Each transition names its applicable gates. WG01 and the [common hold contract](concepts.md#6-common-hold-and-recovery-contract) apply throughout.

Conditions apply at their stated boundary. Drafting a question does not require its answer. Preparing a route candidate does not prove closure.

An unknown result is not a passing result. Separate format, authority, evidence, meaning, and delivery checks.

## Gate index

| Area | Gates |
| --- | --- |
| Common evidence and charting | [WG01](#wg01-evidence-and-preservation) to [WG03](#wg03-map-and-ticket-creation) |
| Ticket authorization and resolution | [WG04](#wg04-fixed-authorization) to [WG07](#wg07-answer-and-consistency) |
| Investigation types | [WG08](#wg08-research) to [WG10](#wg10-dialogue-and-decision-work) |
| Language and route closure | [WG11](#wg11-canonical-language) to [WG14](#wg14-closure-publication) |
| Construction boundary and recovery | [WG15](#wg15-unit-admission) to [WG18](#wg18-recovery) |

## WG01: Evidence and preservation

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Current actor | Required inputs exist and identify the selected effort, ticket, or unit. Existing recognized artifacts pass applicable lint before interpretation. | Report missing or invalid evidence. Do not infer presence from an empty lint result. |
| Artifact writer | Immediately after each recognized mutation, the narrowest file-scoped lint succeeds before another mutation, handoff, or commit. | Correct findings and rerun, or report the exact blocker. Do not claim successful resolution or closure. |
| Current actor | Facts have sources. Conclusions distinguish observations, assumptions, and requester decisions. | Preserve uncertainty and obtain the missing evidence or decision. |
| Current actor | Writes stay inside the assigned boundary and preserve unrelated, staged, partial, and sibling work. | Hold unsafe writes. Obtain scoped authority for destructive effects. |
| Current actor | Covered Operation rules apply to the action, including commit or delegation requirements. | Satisfy the rule or obtain requester direction before handoff. |

Research notes, working glossaries, and disposable prototype files are unrelated outputs. They are outside Kepler artifact lint.

## WG02: Charting

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Wayfinder owner | Grilling and domain modeling are loaded before the first charting question. Dialogue has content and an exit condition. | Load the skills and establish the dialogue scope before questions. |
| Requester and Wayfinder owner | Destination, boundaries, and initial decision space have been explored breadth-first. | Continue bounded dialogue instead of assuming the destination. |
| Wayfinder owner | In-scope fog remains for map creation. | If no fog remains, explain that no map is needed and stop charting. |
| Wayfinder owner | The requester has been asked for operation rules and can decline. | Ask before recording prescriptive rules; leave the section empty when declined. |

Charting resolves no tickets. It can create precise questions while leaving their answers open.

## WG03: Map and ticket creation

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Wayfinder owner | Map uses the installed template, undated effort identity, and six body sections. Initial status is `open`; Decisions so far is empty. | Correct the chart without inventing resolved decisions. |
| Wayfinder owner | Map `branch` records the observed charting branch. Detached HEAD uses the repository default branch and requester notification. | Resolve branch identity before publishing the chart. |
| Wayfinder owner | Each ticket has a precise question, stable numbered file identity, valid type, and initial `open` status. | Keep vague questions as fog; correct identity or type before work. |
| Wayfinder owner | Create tickets first, then wire blocking dependencies from the actual set. | Resolve missing or ambiguous blockers. Do not assume lint validates the cross-file ticket graph. |
| Wayfinder owner | A task ticket names the decision that requires its work now. | Move work that can wait into downstream delivery scope. |

## WG04: Fixed authorization

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Wayfinder owner | An explicit requester instruction authorizes ticket work. Loading the skill or map alone does not. | Report orientation or frontier and stop without a new claim. |
| Wayfinder owner | Named identifiers resolve to actual tickets. A next-frontier request selects the first open, unblocked, unclaimed ticket in file order. | Report and exclude unknown IDs without substitution; report an empty frontier. |
| Wayfinder owner | The resolved set stays fixed and a batch follows ticket file order. | Do not add a newly created, newly unblocked, or substitute ticket. |
| Wayfinder owner | Returned research matches an already authorized dispatch. | Treat unrelated or unbound results as evidence only; do not grant ticket authority. |

A blocked named member remains authorized for consideration at its later turn. Skipping advances the processing position without changing membership.

## WG05: Ticket claim

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Ticket owner | The current member is in the fixed set; its status and every blocker status have just been reread. | Recheck current files before claiming. |
| Ticket owner | The member is currently `open`, unblocked, and unclaimed. | Report and skip an ineligible member without substitution. |
| Ticket owner | Set `claimed` and pass ticket lint before resolution work. | Preserve the failed claim write and correct it before continuing. |
| Ticket owner | The session takes claimed work as far as its type permits. | Report the real interruption; do not park a claim as if work had completed. |

## WG06: Type dispatch

| Type | Required condition | Failure action |
| --- | --- | --- |
| `research` | Load `kepler-wayfinder-research`; dispatch a background investigation with one question and output scope. | Keep the ticket unresolved until supported evidence returns. |
| `prototype` | Load `kepler-wayfinder-prototype`; run the branch gate before code. | Write no prototype artifact before verified branch identity. |
| `grilling` | Load grilling and domain modeling before the first question; use live requester exchange. | Wait for the requester instead of simulating their answer. |
| `task` | Name the decision blocked on manual work; perform it or supply a precise checklist. | Reject delivery-only scope as ticket work. Do not treat an unexecuted checklist as evidence. |

## WG07: Answer and consistency

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Ticket owner | Matching evidence supports the Answer, reason, source pointer, and any required live decision. | Retain claimed status and explicit uncertainty. |
| Wayfinder owner | Ticket Answer, resolved status, and linked one-line map summary reflect the same current result. | Complete missing writeback; do not claim atomic success across files. |
| Wayfinder owner | Contradictory prior answers move to Outdated decisions with superseding-ticket links. Current answers and map summaries agree. | Correct stale current truth while preserving history. |
| Wayfinder owner | Newly precise questions graduate from fog; out-of-scope findings remain explicit boundaries. | Preserve unresolved status representation and seek owner direction for the unsupported close case. |
| Wayfinder owner | Any affected existing route correction stays with its authorized decision owner. | Hold ambiguous route-body changes; downstream lifecycle authority is not body-edit authority. |

## WG08: Research

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Researcher | Findings trace each claim to primary sources that own the subject. | Investigate further or disclose the unsupported claim. |
| Researcher | Save one Markdown findings file under the effort's `research/` directory. | Preserve partial findings and report missing output. |
| Wayfinder owner | Returned evidence matches the authorized question and observed dispatch. | Keep the ticket claimed; obtain bounded correction or missing evidence. |
| Ticket writer | A findings pointer edit passes immediate ticket lint. Research-file content stays outside Kepler lint. | Correct recognized-artifact findings before handoff or commit. |

## WG09: Prototype

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Prototype owner | Exact question and domain determine logic-probe or structural/visual form. | Clarify with the requester or disclose the narrow fallback assumption. |
| Prototype owner | Create or resume the named `prototype/...` branch and verify the switch before any artifact write. | Stop writes. Resume existing work instead of bypassing the gate. |
| Prototype owner | Artifact is clearly disposable, trivial to run, and exposes relevant state. Persistence is absent unless the question requires marked scratch storage. | Reduce unrelated scope or remove unsafe persistence before presenting evidence. |
| Prototype owner and requester | Actual observations support the verdict and settled question. | Keep the decision unresolved or record a supported negative conclusion. |
| Prototype owner | Commit outstanding throwaway work on its branch, return to the starting branch, and retain a reachable branch pointer. | Inspect actual branch/worktree state and preserve partial work. |
| Ticket owner | Write the validated decision on the returned branch and lint the ticket. | Do not move prototype code into production or record an unsupported Answer. |

## WG10: Dialogue and decision work

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Dialogue owner | Look up available facts. Ask one decision question at a time with a recommendation, then wait. | Obtain the fact or requester response before continuing. |
| Dialogue owner | Challenge a concrete weakness once; accept a final reaffirmation and record any reservation in one line. | Do not replace the requester or repeat a settled objection. |
| Requester and dialogue owner | The exit condition and shared understanding are confirmed before acting. | Continue dialogue or stop without claiming resolution. |
| Task-ticket owner | Actual decision-enabling work has completed; required live planning decisions remain requester-owned. | Preserve pending human actions and unsupported conclusions. |

## WG11: Canonical language

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Language owner | Read canonical and current-effort language before changes. Scope terms by bounded context with source references. | Resolve context or meaning conflicts before recording canonical entries. |
| Language owner | In-map resolved terms first enter the working glossary; decisions enter the resolving ticket. | Keep unresolved terms outside canonical entries. |
| Requester and language owner | Any change to committed meaning has explicit requester confirmation. | Preserve the canonical meaning and report the pending decision. |
| Canonical writer | Use the installed template only when the canonical file is missing; new author comes from configured Git name and email. Existing author/content/format remain preserved. | Stop creation for missing identity; correct unsafe replacement. |
| Canonical writer | The completed fold passes file-scoped lint before route creation. | Keep the map open and correct the glossary or report the blocker. |

## WG12: Route consistency

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Wayfinder owner | All tickets have resolved current answers; synthesis exposes no unresolved essential uncertainty. | Keep the map open. Resolve the gap through authorized dialogue or a new ticket. |
| Wayfinder owner | Every binding decision appears with its reason, consequence, and evidence link. | Correct missing or contradictory route content. |
| Wayfinder owner | Units cover the destination, preserve scope boundaries, and follow causal dependency order. | Revise the candidate or return the product decision to the requester. |
| Wayfinder owner | Builder latitude contains only choices that cannot change the destination. | Convert unresolved product or architectural choices into explicit decision work. |

## WG13: Route structure

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Route writer | Five core H2 sections are present. Existing extra lint-valid sections are not rejected. | Correct required structure without imposing another validator. |
| Route writer | Unit IDs are unique; ID, name, and order match numbered Units headings exactly. | Correct metadata/body parity and rerun lint. |
| Route writer | Dependencies are unique, non-self, existing, and acyclic. Backing evidence identifies the intended tickets. | Correct the graph or evidence links. Lint does not verify backing-file existence. |

Lint does not prove causal order, destination coverage, ticket graph validity, or delivery reachability.

## WG14: Closure publication

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Wayfinder owner | Semantic consistency passes before the canonical language fold and route write. | Retain the open map and candidate evidence. |
| Wayfinder owner | Canonical glossary lint succeeds; route lint then succeeds; map route-link and cleared-status lint succeeds. | Preserve each actual partial write and correct the failing boundary. |
| Wayfinder owner | Covered Operation rules, including any commit requirement, are satisfied before handoff. | Complete the required bookkeeping without inferring construction authority. |

There is no unconditional commit-after-ticket rule. The requester's Operation rules and project standards determine that requirement.

## WG15: Unit admission

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Change owner | Existing plan binding controls resume; non-null proposal binding agrees. New unbound work selects the first pending unit in metadata order. | Hold mismatches. Do not skip a blocked unit without owner authority. |
| Change owner | Each dependency is shipped and reachable from the actual delivery base. | Wait for merge or obtain an explicit decision to branch from its work. |
| Requester/controller | One owner per unit and one writer per change/worktree; known proposals/plans, local/visible remote branches, and worktrees have been inspected. | Prefer owner resume. Hold competing or ambiguous claims. |
| Change owner | Canonical route/unit, source revision, owner/change, source/target, and input/base match current evidence after any workspace switch. | Recalculate the handoff before new artifact or code writes. |
| Change owner | Named source differs from actual delivery target by normalized refs and configured mapping. | Resolve branch roles. Isolation or unequal tip commits alone is insufficient. |
| Change owner | Claim changes only the selected unit to `in-progress` and ships with the matching initial change scaffold. | Preserve sibling state; correct incomplete claim publication. |

## WG16: Construction boundary

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Intent owner or planner | Unit outcome and binding constraints enter the correct formal or tactical construction path. | Return contract changes to formal intent. |
| Intent owner and requester | Formal approval binds exact committed candidate revisions. | Do not substitute route agreement or lint for approval. |
| Coordinator and finish owner | Task admission, integrated verification, independent task feedback, branch review, and finish preconditions pass under construction rules. | Hold the affected downstream operation; inception completion grants no exception. |

See [construction gates](../phase_construction/gates.md) for the complete SDD conditions.

## WG17: Shipment

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Finish owner | Committed finish intent identifies the exact route/map/unit, owner/change/source/target/base, source blob, and shipping condition. | Hold changed or ambiguous identity without recreating authority. |
| Finish owner | The selected strategy has observed qualification compatible with Shipping rules and additional owner requirements. | Keep the unit unshipped; record the real blocked or partial result. |
| Finish owner | Automated repair sees exactly one canonical Qualification token matching the original condition. | Obtain owner adjudication; do not rewrite admitted history. |
| Finish owner | Advance only the named `in-progress` unit after qualification, lint and persist changes, and verify remote effects when required. | Preserve partial effects and use construction finalization repair. |
| Finish owner | Every unit qualifies before map `shipping` becomes `shipped`. | Leave aggregate shipment incomplete and report outstanding units. |

## WG18: Recovery

| Check owner | Required condition | Failure action |
| --- | --- | --- |
| Current owner | Inspect actual files, claims, branches, background runs, and Git/provider effects before retry. | Preserve unknown state and request the missing evidence. |
| Ticket owner | An interrupted claim has explicit owner direction before release or reassignment. | Retain the claim; no automatic expiry or reopen. |
| Unit owner/controller | Transfer or release has explicit owner authority, partial-work preservation, and fresh dependency checks. | Retain dirty, shared, or uncertain workspaces and verified shipment. |
| Current owner | Retry has changed evidence, an external condition, or corrected input. | Stop identical retries and identify the unresolved requirement. |
| Finish owner | Partial delivery follows the construction repair contract and retains original identities. | Do not infer rollback, reset shipped units, or repeat external delivery. |
