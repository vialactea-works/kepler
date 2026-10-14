---
artifact: design
change: <YYYY-MM-DD-change-title>
status: draft
created: <YYYY-MM-DD>
author: <Name <email>>
decision: accepted | rejected | skipped
route_unit: null
---

<!--
  SDD: Design / "How" (IEEE 1016-inspired, right-sized)
  Produced by: kepler-propose (step 1 of the seven-stage pipeline).
  Describe the change's domain model and architecture. Reference proposal.md for why and
  requirements/ for what. Explain responsibilities and boundaries before supporting decisions.
  Put implementation steps in plan.md.
  Optional artifact: mechanical changes may start at plan.md.
  Keep the seven lint-required headings: Context, Goals / Non-Goals, Decisions, Architecture &
  Components, Testing Strategy, Constraints & Boundaries, and Risks / Trade-offs. Keep their
  explanations brief when no facts apply. Omit irrelevant optional sections rather than inventing
  content. Use the tables where helpful; they are optional. Historical lint-valid designs remain valid
  without the new model or mapping sections; do not rewrite approved history.
  Drafts and template defaults do not establish requester approval. Present the exact final candidate bytes,
  including status: approved and decision: accepted, and obtain explicit approval before writing them.
  Commit exactly those bytes. Later intent edits require fresh approval.
  Delete this comment block and inline hints before finalizing.
  Before creating this artifact, read `git config user.name` and `git config user.email`.
  Use both values in `author: Name <email>`. If either is missing, ask the user or stop;
  never invent an identity. Preserve existing author attribution unless the user directs a change.
-->

# Design: <Change Title>

## Context

<!-- Describe the current architecture, scope and constraints. Read the canonical glossary first;
     use authoritative project documentation for missing meanings. Cite each source and its context.
     Reference the proposal's Domain Context rather than copying the glossary. If no glossary exists,
     disclose the gap and use documented project language. Separate established facts, proposed changes
     and assumptions. Record undefined or conflicting terms in Open Questions. Material uncertainty
     about language or ownership blocks approval. Do not redefine terms or edit the glossary here. -->

## Goals / Non-Goals

**Goals**

- <observable outcome in sourced, context-scoped project language; reference the proposal or requirement>

**Non-Goals**

- <what is explicitly out of scope for the design>

## Domain Model

<!-- Optional when the affected model is already clear from Context and upstream references.
     Cover relevant domains, subdomains and bounded contexts; terms and relationships; commands,
     events, states and invariants. Name each rule's owner and explain how meanings translate across
     contexts. Distinguish current and proposed models and cite their sources. Use core, supporting
     or generic subdomain classifications only when supported. A package, directory, service or
     transport is not automatically a bounded context. Do not invent events, ports or definitions
     to fill this outline. Omit irrelevant model elements. Treat missing material evidence as an
     open question, not proof that an element is irrelevant. -->

## Architecture & Components

<!-- Explain current and proposed boundaries, responsibility and data ownership, cross-context
     interactions, trust, compatibility and coordination. If boundaries remain intact, say which
     and why. Keep domain rules and application use cases independent of infrastructure;
     dependencies point toward the application core. Reuse existing seams and abstractions.
     Distinguish dependency direction from runtime calls and data flow. Cover every affected package
     and responsibility; use prose or tables proportional to the change. -->

### Packages

<!-- For each package created, modified or removed, describe its domain/context or infrastructure
     role and its provided and required ports. For removals, explain where responsibilities, contracts
     and consumers move or which are retired. Preserve callers' success and failure outcomes in
     replacement contracts and requirements unless explicitly changed or retired. If no package changes,
     state that briefly and omit this subsection. A package may span contexts; name each responsibility's owner. -->

| Package | Change | Responsibility | Domain / context and role | Exposes | Depends on |
| --- | --- | --- | --- | --- | --- |
| <package> | <created, modified or removed> | <what it owns> | <sourced owner; domain, application or infrastructure role> | <provided contracts or none> | <required contracts or none> |

### Ports & Adapters

<!-- Name inbound use-case contracts and outbound capabilities, their owners and relevant inputs,
     results, errors and invariants. Identify consumers, providers and adapters for UI, storage or
     external services, including model translation at context boundaries. A port may be an existing
     function or injected collaborator; do not add an interface merely to fill a row. Separate
     existing contracts from explicitly proposed additions, changes or retirements. Omit this
     subsection when no port or adapter is affected, explaining intact seams in the architecture prose. -->

| Port / contract | Direction and owner | Consumers / providers | Adapter and translation | Source / proposed change |
| --- | --- | --- | --- | --- |
| <contract> | <inbound or outbound relative to the owning use case/context> | <caller and provider> | <adapter, translated meanings or none> | <existing reference or proposed contract> |

### Code Attribution

<!-- Map affected modules and significant symbols to their responsibilities and domain/context or
     infrastructure roles. Verify existing references against source. Mark proposed code as proposed
     and name its contract and owner. For removed code, explain what disappears or who takes over its
     responsibility; check surviving consumers. This mapping records responsibilities, not authorship.
     A few sentences may replace the table. Omit unrelated code and plan task steps. -->

| Code | Existing / proposed / removed | Domain / context or infrastructure role | Responsibility | Source |
| --- | --- | --- | --- | --- |
| <module or symbol> | <reference status> | <sourced owner and role> | <rule, use case or adapter it realizes> | <code reference or explicit proposal> |

### Quality Lens

<!-- Assess this design against code-quality.md and record evidence. Scale the review to the change:
     for a mechanical or single-file change, one line ("trivial: no structural risk") suffices.
     For a non-trivial change, cover:
     - Responsibility: each unit's single reason to change (if it needs "and", split it).
     - Boundaries & dependencies: what each unit hides; where high-level logic depends on an
       abstraction; and where tests can substitute for concrete IO, databases or clocks.
     - Right-sizing: an abstraction or extension point you deliberately omitted.
     - Accepted smells: any deliberate structural trade-off and its reason (also list it under
       Risks / Trade-offs). A smell that is neither fixed nor recorded here fails self-review. -->

## Data & Flow

<!-- Optional: show commands, interactions and observable outcomes across the named boundaries.
     Describe relevant state transitions, guards, emitted events and failure paths, identifying the
     owner of each invariant. A domain event does not imply a message broker. Omit when no flow
     changes; reference established behavior rather than inventing transitions. -->

## Decisions

<!-- Explain significant model or architectural choices. If there is no new choice, say so briefly;
     do not invent alternatives for a predetermined change. -->

### Decision: <name>

- Choice: <what we are doing; reference the affected model or boundary>
- Alternatives considered: <viable alternatives and why they were rejected, or the constraint fixing this choice>
- Rationale: <why this option was chosen; the accepted trade-off>

## Error Handling & Edge Cases

<!-- Describe expected behavior for each failure mode, including partial failure and retry.
     A "Failure -> Behavior" table may help. -->

## Testing Strategy

<!-- Define unit and integration test boundaries, key cases and verification commands. Name the tactical gates, `kepler-code` and
     `kepler-code-feedback`, and the final gates, `kepler-review` and
     `kepler-finish-work`. Tie checks to the named contracts, state transitions and invariant
     owners; substitute outbound ports in core tests and exercise adapter translation at boundaries. -->

## Constraints & Boundaries

<!-- List change-specific operating boundaries for the implementing agent in three tiers.
     Keep project-wide rules in AGENTS.md or guidelines.
     For "Ask first", ask the user when attended. When unattended, answer the question and record
     the reasoning before proceeding. Material language or ownership questions still require
     requester resolution. If no change-specific boundaries apply, retain the heading and say so. -->

- Always: <actions the agent should take without asking, e.g. run tests before commit>
- Ask first: <actions needing a decision, e.g. changing a public interface>
- Never: <hard stops, e.g. touch the auth module, delete a failing test>

## Risks / Trade-offs

<!-- Known risks and limitations. Format: [Risk] -> Mitigation. -->

## Migration / Rollout

<!-- Deploy steps, backward compatibility, and rollback strategy. Omit if not
     applicable. -->

## Open Questions

<!-- List undefined terms, conflicting sources, uncertain ownership and other unresolved decisions.
     Cite the source and explain what needs resolution. Resolve material model or boundary questions
     with the requester before approval. Keep unattended work draft. Remove this section if no questions remain. -->

-
