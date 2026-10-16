# Workflow version 3: authoring progress

[Workflow phase index](README.md) | [Functional Design draft](phase_construction/functional-design.md)

## Purpose

Track the next authoring decisions and the decisions deferred to later work. This file records specification work, not the execution state of a Unit of Work.

The Functional Design contract remains a draft. A saved draft is not approval of all its contents.

## Agreed decisions

- Functional Design requires `unit-of-work.md` and `design.md` at `.kepler/units-of-work/<unit-id>/`.
- `unit-of-work.md` supplies the definition shared by all stages. Its required sections are Purpose, Scope, and Context. See the [section contract](phase_construction/functional-design.md#unit-of-work-definition).
- Functional Design requires Domain behavior, Domain model, Boundaries and interactions, and Design decisions and open questions in `design.md`. See the [section contract](phase_construction/functional-design.md#functional-design).
- Non-functional Requirements replaces Non-functional Design & Requirements. It requires `.kepler/units-of-work/<unit-id>/quality.md`.
- Applicable non-functional requirements include performance, availability, security, accessibility, compatibility, operability, and observability.
- Implementation Planning selects the technical solution before it divides the work into tasks. See the [stage boundaries](phase_construction/README.md#agreed-boundaries).
- `kepler-architect` is the Functional Design owner and uses `kepler-design`. No other agent roles are defined for this stage.
- Supporting skills adapt structured questioning, domain modeling, and research from `kepler-grilling`, `kepler-wayfinder-domain-modeling`, and `kepler-wayfinder-research`. Their paths and artifact contracts must follow version 3. See [supporting skills](phase_construction/functional-design.md#supporting-skills).
- Self-review is implemented within `kepler-design` and performed by `kepler-architect`. It is not a separate supporting skill. External review occurs only when the requester asks for it.
- Functional Design requires explicit requester approval, recorded in Unit of Work metadata. Exact fields and formats remain part of SH02. See [review and approval](phase_construction/functional-design.md#review-and-approval).
- Required documents have required sections. Additional detail lives in linked files under `details/`, not optional inline sections.
- Functional Design supporting files live under `details/functional-design/`.
- The shared [Depth definition](depth.md) uses Minimal, Standard, and Comprehensive levels.
- Depth controls analysis and documentation detail. It does not remove required information, weaken verification, or prescribe file counts or page lengths.
- The shared [Revision rules](revision.md) start at the earliest affected stage and reopen every downstream stage and its artifacts. Upstream stages remain complete while their contracts and outputs remain valid.
- Each stage contract defines a reopening questionnaire for the shared revision procedure. A questionnaire does not exempt downstream stages from the cascade. Functional Design defines its [questionnaire](phase_construction/functional-design.md#reopening-questionnaire).

## Next Functional Design decisions

All listed Functional Design decisions are agreed and recorded. Next, review the complete stage draft. The stage contract remains a draft until the requester accepts it as a whole. Shared decisions and later stage contracts remain open.

| ID | Decision | Questions to resolve | Status |
| --- | --- | --- | --- |
| FD01 | Required content | Agreed and recorded: [Unit of Work definition](phase_construction/functional-design.md#unit-of-work-definition) and [Functional Design contribution](phase_construction/functional-design.md#functional-design), including sufficient content and use of references. | Complete. |
| FD02 | Stage responsibilities and documents | Agreed and recorded: Non-functional Requirements uses `quality.md`; Implementation Planning selects the technical solution. See the [stage boundaries](phase_construction/README.md#agreed-boundaries). | Complete. |
| FD03 | Entry and completion conditions | Agreed and recorded: [entry conditions](phase_construction/functional-design.md#entry-conditions), [completion conditions](phase_construction/functional-design.md#completion-conditions), and [blocking rule](phase_construction/functional-design.md#blocking-rule). | Complete. |
| FD04 | Review and approval | Agreed and recorded: required self-review, requester-triggered external review, and explicit requester approval in metadata. See [review and approval](phase_construction/functional-design.md#review-and-approval). | Complete. |
| FD05 | Reopening rules | Agreed and recorded: the [reopening questionnaire](phase_construction/functional-design.md#reopening-questionnaire) supplies stage-specific rules to the shared revision procedure. Existing self-review and approval conditions apply again. | Complete. |
| FD06 | Agents and skills | Agreed and recorded: [kepler-architect](phase_construction/functional-design.md#agent-roles), `kepler-design`, and [supporting skill responsibilities and adaptations](phase_construction/functional-design.md#supporting-skills). Other agent roles are excluded. | Complete. |

## Filename convention

Use short filenames with full words, without abbreviations. The agreed `quality.md` replaces the proposed `requirements.md` name. Non-functional Requirements does not share `design.md` with Functional Design.

## Shared decisions still pending

These decisions affect several stages. Define them in shared contracts rather than only in Functional Design.

Complete the core definitions of Project references (DF01), depth (SH03), and artifact metadata (SH02). The existing [Depth definition](depth.md) records agreed levels and limits, but its selection rules remain open.

The Unit of Work definition also needs scope and decomposition criteria (SH05). The Functional Design entry condition uses "fit within one Unit of Work", but those criteria are not yet defined.

| ID | Decision | Open scope |
| --- | --- | --- |
| SH01 | Unit of Work identity | Identifier format and its relationship to the directory name. |
| SH02 | Artifact metadata | Required fields, their meanings, and their formats. Include approval records and references to approved document versions. |
| SH03 | Depth | Complete the shared contract: who selects depth, defaults, changes during work, and any stored values. Preserve the agreed levels and limits. |
| SH04 | Revision and recovery | The [shared cascade rule and questionnaire mechanism](revision.md) are recorded. Still define editorial corrections and recovery from interrupted work. Stage questionnaires belong to stage contracts. |
| SH05 | Unit of Work scope | Define what belongs in one Unit of Work, scope and size criteria, and when to divide work into multiple units. |

## Deferred decisions

| ID | Decision | Return to it when |
| --- | --- | --- |
| DF01 | Project references | Define their internal document structure, authority, and update rules when we design these shared references. |
| DF02 | Inception | Define intent documents, terminology, and the production of one or more Units of Work when we design Inception. Include the previous route concept and its relationship to Units of Work. |
| DF03 | Initialization | Define project preparation when we design the Initialization phase. |
| DF04 | Later construction stages | Define the remaining stage contracts, artifact sections, reopening questionnaires, agents, and skills after Functional Design. Include the location of the technical design record from Implementation Planning. Use the [stage outline](phase_construction/README.md#stage-outline). |

## Record maintenance

Update this file when a decision changes. Mark a decision complete only after the requester agrees and the relevant specification records it. Link to that specification when a decision is complete.

Keep proposed choices distinct from agreed choices. Do not move a deferred decision into the current scope without an explicit decision.

Use ASD-STE100 Simplified Technical English. Do not run workflow-reference tests.
