# Reference maintenance

[Reference index](README.md) | Previous: [Artifacts](artifacts.md)

## Authority and change order

This folder defines Wayfinder's inception contracts. [Construction](../phase_construction/README.md) defines SDD execution and finish.

For a workflow change, update the affected state, transition, gate, artifact, and owner here first. Then align skills, templates, CLI mechanics, tests, and explanatory documents.

A document-only change does not make a missing CLI behavior available. Record deliberate differences and never bypass a failing runtime gate.

State and transition IDs are document identifiers. No new stored fields, statuses, lock service, or status database follows from this reference.

## Reference structure

| Contract area | Canonical page | Change rule |
| --- | --- | --- |
| Terms, roles, and common recovery | [Concepts](concepts.md) | Introduce terms before detailed operations. Separate stored values from conceptual states. |
| Phase boundaries | [Workflow map](lifecycle.md) | Keep inception optional and preserve the seven construction steps. |
| Destination and initial frontier | [Charting](charting.md) | Separate ticket creation from ticket-work authorization. |
| Selection, claims, and writeback | [Ticket cycle](ticket-cycle.md) | Preserve fixed membership, per-turn eligibility, and explicit supersession. |
| Evidence-producing work | [Investigations](investigations.md) | Keep type-specific gates and output ownership distinct. |
| Vocabulary | [Domain modeling](domain-modeling.md) | Confirm canonical meaning changes and preserve attribution. |
| Static delivery contract | [Route compilation](route.md) | Separate semantic consistency from structural validity. |
| Construction interface | [Handoff](handoff.md) | Preserve identity, dependencies, branch roles, ownership, and observed qualification. |
| Transition conditions | [Gates](gates.md) | Conditions stay in tables, outside diagrams. |
| Files and CLI limits | [Artifacts](artifacts.md) | Distinguish schema checks, skill policy, and actual runtime enforcement. |

## Source map

This reference records the Wayfinder contracts inspected on branch `refact/improve-v2` at baseline `65f28f1b57847c7e8de52e4df2358d5d1a5d06ba`.

These sources support the definition. They do not become another independent definition of workflow meaning.

| Area | Skill or template evidence | Runtime and test evidence |
| --- | --- | --- |
| Map, authorization, ticket work, and closure | [Wayfinder](../../../skills/kepler-wayfinder/SKILL.md), [map template](../../../bundle/templates/wayfinder/map.md), [ticket template](../../../bundle/templates/wayfinder/ticket.md) | [Artifact body](../../../packages/cli/src/workbench/artifact-body.ts), [artifact contracts tests](../../../tests/workbench/artifact-contracts.test.ts) |
| Background research | [Research skill](../../../skills/kepler-wayfinder-research/SKILL.md) | No research scheduler or ticket-resolution command in the CLI. |
| Disposable prototype | [Prototype skill](../../../skills/kepler-wayfinder-prototype/SKILL.md) | [Prototype operation](../../../packages/cli/src/workbench/prototype.ts), [prototype tests](../../../tests/workbench/prototype.test.ts) |
| Human decision dialogue | [Grilling](../../../skills/kepler-grilling/SKILL.md) | No CLI operation can supply the requester's decision. |
| Language | [Domain modeling](../../../skills/kepler-wayfinder-domain-modeling/SKILL.md), [working format](../../../skills/kepler-wayfinder-domain-modeling/references/GLOSSARY-FORMAT.md), [canonical template](../../../bundle/templates/glossary.md) | [Artifact schemas](../../../packages/cli/src/workbench/artifact-schemas.ts), [schema tests](../../../tests/workbench/artifact-schemas.test.ts) |
| Route synthesis and unit graph | [Route template](../../../bundle/templates/wayfinder/route.md), [Wayfinder route contract](../../../skills/kepler-wayfinder/SKILL.md#the-route) | [Route relations tests](../../../tests/workbench/route-relations.test.ts), [artifact types](../../../packages/cli/src/workbench/artifact-types.ts) |
| Change selection and unit claims | [Propose](../../../skills/kepler-propose/SKILL.md), [plan](../../../skills/kepler-plan/SKILL.md) | [Context](../../../packages/cli/src/workbench/context.ts), [context tests](../../../tests/workbench/context.test.ts) |
| Delivery and finalization repair | [Finish-work](../../../skills/kepler-finish-work/SKILL.md), [finish template](../../../bundle/templates/finish.md) | [Route repair inspection](../../../packages/cli/src/workbench/finish-route.ts), [claim inspection](../../../packages/cli/src/workbench/finish-claims.ts), [route tests](../../../tests/workbench/finish-route.test.ts), [claim tests](../../../tests/workbench/finish-claims.test.ts) |
| Reference structure and navigation | [Phase index](../README.md) | [Phase documentation tests](../../../tests/docs/workflow-phases.test.ts) |

## Known source gaps

| Area | Observed source difference or missing rule | Reference treatment |
| --- | --- | --- |
| Research at charting | Charting says to dispatch any research in parallel. Ticket work requires explicit requester authority before a claim or dispatch. | Separate creation from dispatch. Require explicit authority; do not treat charting or a new research file as permission. An owner must resolve any broader intended exception. |
| Out-of-scope ticket closure | The work loop says to close the ticket. Stored ticket statuses are only `open`, `claimed`, and `resolved`. | Do not add `closed` or silently map it to resolved. Preserve the boundary and obtain owner direction before closure depends on it. |
| Historical map branch | The skill describes a default-branch fallback for a map without `branch`. Current artifact metadata requires `branch`. | Explain the intended historical fallback, but disclose that current lint rejects the missing field. Do not bypass lint or silently rewrite historical artifacts. |
| Route-level aggregate status | Schema permits `open`, `shipping`, and `shipped`. The skill defines map and unit flips without a complete route-level update rule. | Document allowed values without inventing automatic transitions or extra downstream write authority. |
| Route decision correction | Consistency says to update a unit's “decision line”; the template defines contribution and constraints, not that field. | Keep correction with the Wayfinder decision owner. Hold ambiguous body changes; lifecycle writers cannot reinterpret the destination. |
| Ticket graph and backing links | Lint checks positive blocker IDs and nonempty backing strings, not cross-file existence or ticket-graph coherence. | Keep actual evidence checks with the owner. Do not claim a new CLI validation feature. |
| Route policy enforcement | Context resolves binding, unit existence, and committed route identity. Broader admission policy remains with skills/controllers; route/claim audit also appears in finalization repair. | Do not describe ordinary context or finish precondition success as proof of dependency reachability, unique ownership, or delivery. |

These gaps do not authorize speculative implementation. A change to behavior needs explicit owner decisions and aligned downstream surfaces.

## Verification procedure

1. Compare each phase boundary with the construction consumer contract.
2. Check every diagram edge against its transition row and gate references.
3. Check each state for actor, input evidence, output, and stored-state distinction.
4. Check authorization-only, unknown-ID, blocked-member, and returned-research paths.
5. Check each investigation's positive, negative, interruption, and writeback behavior.
6. Check glossary confirmation, attribution, and route-write ordering.
7. Check structural route validity separately from semantic consistency and actual delivery.
8. Verify local links, section targets, tables, and Markdown parsing.
9. Read in index order and check active voice, short sentences, and consistent technical terms.
10. Disclose graphical rendering, runtime scenarios, or language validation that was not performed.

Documentation tests establish navigation and contract presence. They do not certify complete methodology behavior or ASD-STE100 dictionary compliance.

Graphical Mermaid rendering and live Wayfinder ticket sessions require separate verification. A documentation edit must not claim those checks occurred.
