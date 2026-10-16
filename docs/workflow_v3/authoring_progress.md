# Workflow version 3: authoring progress

[Workflow phase index](README.md) | [Functional Design draft](phase_construction/functional-design.md)

## Purpose

Track the next authoring decisions and the decisions deferred to later work. This file records specification work, not the execution state of a Unit of Work.

The Functional Design contract remains a draft. A saved draft is not approval of all its contents.

## Agreed document decisions

- Functional Design requires `unit-of-work.md` and `design.md` at `.kepler/units-of-work/<unit-id>/`.
- `unit-of-work.md` supplies the definition shared by all stages. Its required sections are Purpose, Scope, and Context. See the [section contract](phase_construction/functional-design.md#unit-of-work-definition).
- Functional Design requires Domain behavior, Domain model, Boundaries and interactions, and Design decisions and open questions in `design.md`. See the [section contract](phase_construction/functional-design.md#functional-design).
- Non-functional Requirements replaces Non-functional Design & Requirements. It requires `.kepler/units-of-work/<unit-id>/quality.md`.
- Applicable non-functional requirements include performance, availability, security, accessibility, compatibility, operability, and observability.
- Implementation Planning selects the technical solution before it divides the work into tasks. See the [stage boundaries](phase_construction/README.md#agreed-boundaries).
- Required documents have required sections. Additional detail lives in linked files under `details/`, not optional inline sections.
- Functional Design supporting files live under `details/functional-design/`.
- The shared [Depth definition](depth.md) uses Minimal, Standard, and Comprehensive levels.
- Depth controls analysis and documentation detail. It does not remove required information, weaken verification, or prescribe file counts or page lengths.

## Next Functional Design decisions

Work through these decisions in order. Required Functional Design content, stage responsibilities, entry conditions, and completion conditions are agreed and recorded. Next, define review and approval.

| ID | Decision | Questions to resolve | Status |
| --- | --- | --- | --- |
| FD01 | Required content | Agreed and recorded: [Unit of Work definition](phase_construction/functional-design.md#unit-of-work-definition) and [Functional Design contribution](phase_construction/functional-design.md#functional-design), including sufficient content and use of references. | Complete. |
| FD02 | Stage responsibilities and documents | Agreed and recorded: Non-functional Requirements uses `quality.md`; Implementation Planning selects the technical solution. See the [stage boundaries](phase_construction/README.md#agreed-boundaries). | Complete. |
| FD03 | Entry and completion conditions | Agreed and recorded: [entry conditions](phase_construction/functional-design.md#entry-conditions), [completion conditions](phase_construction/functional-design.md#completion-conditions), and [blocking questions](phase_construction/functional-design.md#blocking-questions). | Complete. |
| FD04 | Review and approval | Decide when independent review is required, what the requester approves, and how approval is recorded. | Pending. |
| FD05 | Revision and recovery | Define how later findings reopen the stage and which changes require new review or approval. | Pending. |
| FD06 | Agents and skills | Select agent profiles and supporting skills. Define their responsibilities and limits. | Pending. |

## Filename convention

Use short filenames with full words, without abbreviations. The agreed `quality.md` replaces the proposed `requirements.md` name. Non-functional Requirements does not share `design.md` with Functional Design.

## Shared decisions still pending

These decisions affect several stages. Define them in shared contracts rather than only in Functional Design.

| ID | Decision | Open scope |
| --- | --- | --- |
| SH01 | Unit of Work identity | Identifier format and its relationship to the directory name. |
| SH02 | Document metadata | Required fields, their meanings, and their formats. |
| SH03 | Depth selection | Who selects depth, defaults, changes during work, and any stored values. |

## Deferred decisions

| ID | Decision | Return to it when |
| --- | --- | --- |
| DF01 | Application reference | Define its internal document structure, authority, and update rules when we design that shared reference. |
| DF02 | Inception | Define intent documents, terminology, and the production of one or more Units of Work when we design Inception. Include the previous route concept and its relationship to Units of Work. |
| DF03 | Initialization | Define project preparation when we design the Initialization phase. |
| DF04 | Later construction stages | Define the remaining stage contracts, artifact sections, agents, and skills after Functional Design. Include the location of the technical design record from Implementation Planning. Use the [stage outline](phase_construction/README.md#stage-outline). |

## Record maintenance

Update this file when a decision changes. Mark a decision complete only after the requester agrees and the relevant specification records it. Link to that specification when a decision is complete.

Keep proposed choices distinct from agreed choices. Do not move a deferred decision into the current scope without an explicit decision.

Use ASD-STE100 Simplified Technical English. Do not run workflow-reference tests.
