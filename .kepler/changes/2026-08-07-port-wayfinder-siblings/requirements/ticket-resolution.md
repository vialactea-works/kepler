# Capability: ticket-resolution

The procedures a wayfinder decision ticket is resolved by — what each one investigates or builds, and where the artifact it produces comes to rest.

## ADDED Requirements

### Requirement: Research procedure

The system SHALL resolve a `research` ticket by delegating the investigation to a background agent that works from primary sources and records its findings as a single Markdown file citing the source of each claim.

- Priority: must
- Rationale: `research` is the one AFK ticket type. Delegating it to a background agent is what makes it AFK — the session that raised the question keeps working while the reading happens. Primary sources are what make a finding load-bearing enough for a decision to rest on.

#### Scenario: a research ticket is worked

- WHEN a `research` ticket is picked up
- THEN the investigation runs in a background agent rather than in the picking session

#### Scenario: a claim is sourced

- WHEN the investigation encounters a claim in a secondary write-up
- THEN the claim is followed back to the official documentation, source code, specification, or first-party API that owns it, and that source is what is cited

#### Scenario: findings are recorded

- WHEN the investigation completes
- THEN its findings exist as one Markdown file, and every claim in it names the source it came from

### Requirement: Research findings home

The system SHALL write research findings under `.hamilton/maps/<effort>/research/`.

- Priority: must
- Rationale: upstream defers this to whatever convention the repository already has and names no fallback, which leaves the artifact homeless in a repository that has no such convention. Hamilton has a map directory that already holds the ticket the findings answer, so the findings belong beside it.

#### Scenario: findings are saved

- WHEN a research investigation records its findings
- THEN the file lands under the `research/` directory of the map whose ticket raised the question

#### Scenario: a second research ticket on the same map

- WHEN more than one research ticket on a map has been resolved
- THEN each investigation's findings are separable from the others' rather than merged into one file

### Requirement: Prototype procedure

The system SHALL resolve a `prototype` ticket by building throwaway code that answers one design question, routed by the shape of that question to either the logic branch or the UI branch.

- Priority: must
- Rationale: a prototype earns its cost by answering a question, and the two questions worth prototyping — whether a state model feels right, and what an interface should look like — call for materially different artifacts. Routing first is what keeps the branch from being chosen by habit.

#### Scenario: the question is about a state model

- WHEN the ticket asks whether a logic or state model feels right
- THEN the logic branch is taken

#### Scenario: the question is about an interface

- WHEN the ticket asks what something should look like
- THEN the UI branch is taken

#### Scenario: the question fits neither branch cleanly

- WHEN the question does not clearly indicate a branch
- THEN the ambiguity is resolved before building rather than by picking a branch and starting

#### Scenario: the prototype is built

- WHEN prototype code is written
- THEN it is marked as throwaway from the outset, and is not carried into production as-is

### Requirement: Prototype capture

The system SHALL record a resolved prototype as a context pointer in the ticket's body naming the branch the prototype lives on, with the design verdict recorded in that ticket's `## Answer` section.

- Priority: must
- Rationale: upstream hangs this pointer on an implementation issue. Hamilton has no issue tracker by deliberate choice, and its tickets are already decision records, so the ticket file absorbs both halves — the pointer to the artifact and the answer the artifact produced.

#### Scenario: a prototype answers its question

- WHEN the human reaches a verdict on the prototype
- THEN the verdict is written into the ticket's `## Answer` section, and the ticket body carries a pointer to the branch holding the prototype

#### Scenario: the prototype code after the verdict

- WHEN the verdict is recorded
- THEN the prototype remains reachable on its own branch rather than being deleted, and no issue tracker is consulted at any point

### Requirement: Domain-model sharpening

The system SHALL provide a procedure that sharpens an effort's domain vocabulary during a `grilling` ticket by challenging imprecise language, testing terms against concrete scenarios, and cross-referencing them with the code.

- Priority: must
- Rationale: vocabulary drift is cheapest to catch while the decision is being made and most expensive to unpick afterwards. Running the sharpening inside the grilling session, rather than as a pass over the result, is what makes it cheap.

#### Scenario: a fuzzy term is used

- WHEN a term is used loosely or two terms are used for one thing during a grilling session
- THEN the imprecision is surfaced and resolved into a single agreed term

#### Scenario: a term is tested

- WHEN a proposed definition is under discussion
- THEN it is checked against a concrete scenario and against how the code already uses the term

#### Scenario: the ticket type

- WHEN domain-model sharpening runs
- THEN it runs within an existing `grilling` ticket; it is NOT a ticket type of its own, and the four ticket types are unchanged

### Requirement: Working glossary home

The system SHALL record an effort's crystallized terms in a working glossary at `.hamilton/maps/<effort>/glossary.md`.

- Priority: must
- Rationale: upstream writes this glossary to a `CONTEXT.md` at the repository root, which stands directly across from `.hamilton/specs/` as a second durable-truth system. Re-homing it under the map makes it the effort's working artifact rather than a competing canonical one, and leaves `.hamilton/specs/glossary.md` as the single canonical destination reached only when the map's terms are harvested.

#### Scenario: a term settles during a session

- WHEN a term's definition is agreed during a grilling session
- THEN it is written to the map's `glossary.md` as the session runs, rather than reconstructed afterwards

#### Scenario: files written outside the map

- WHEN domain-model sharpening records anything
- THEN no `CONTEXT.md` is created at the repository root and no `docs/adr/` directory is created

### Requirement: Decision capture in the ticket

The system SHALL record a hard decision surfaced during sharpening in the resolving ticket's `## Answer` section, and SHALL offer to record one only when the decision is hard to reverse, surprising without context, and the result of a real trade-off.

- Priority: must
- Rationale: a wayfinder ticket already is a decision record — a question with its answer appended — so a separate numbered decision-record file would be a second copy of the same thing under a different name. Upstream's three-part bar is what keeps the section from filling with decisions that needed no recording, and it survives the re-homing unchanged.

#### Scenario: a decision clears the bar

- WHEN a decision is hard to reverse, surprising without context, and the result of a real trade-off
- THEN recording it is offered, and it is written into the resolving ticket's `## Answer` section

#### Scenario: a decision misses one criterion

- WHEN a decision satisfies only some of the three criteria
- THEN no decision record is offered for it

#### Scenario: the record's location

- WHEN a decision is recorded
- THEN it lives in the ticket, and no separately numbered decision-record file is created

### Requirement: Reachability from another skill

Each ticket-resolution procedure SHALL be reachable by another skill invoking it by name.

- Priority: must
- Rationale: these procedures exist to be dispatched to by whatever runs a map — a ticket's type is a promise that its resolving procedure will be invoked. A configuration that hides a procedure from the agent's reach hides it from other skills too, which would leave the promise unkeepable.

#### Scenario: a skill invokes a procedure by name

- WHEN a skill that works a map invokes a ticket-resolution procedure by name
- THEN the invocation resolves and the procedure runs

#### Scenario: a person invokes a procedure directly

- WHEN a person invokes a procedure by name
- THEN it runs the same procedure; there is no second mode

### Requirement: Verbatim fidelity to upstream

The instruction text of each ticket-resolution procedure SHALL be byte-identical to its upstream original, with alterations confined to the adaptation surface — frontmatter, naming, invocation mode, the provenance pointer, and re-homed paths, where a re-homed path is both where the procedure writes its artifact and where its own reference material sits.

- Priority: must
- Rationale: the fork's value is that it stays diffable against upstream in both directions, so improvements flow either way without a reconciliation pass. Rewriting upstream prose to taste is what destroys that, and it does so invisibly — the text still reads well, but the diff is no longer meaningful. The surface is exercised only where Hamilton's world genuinely differs: a procedure's trigger phrasing is carried across whole even though the surface would permit narrowing it, because a narrowed trigger list is indistinguishable from upstream's at a glance.

#### Scenario: a ported file is diffed against upstream

- WHEN a ported file is compared with the upstream file it came from
- THEN the differences are confined to the adaptation surface

#### Scenario: upstream prose reads weakly

- WHEN upstream's own wording is judged weak
- THEN it is carried across unchanged and the observation is noted for a separate effort

#### Scenario: a branch or format guide is judged unnecessary

- WHEN part of an upstream skill appears unused by the ticket types that invoke it
- THEN it ships whole rather than trimmed

## MODIFIED Requirements

None.

## REMOVED Requirements

None.

## RENAMED Requirements

None.
