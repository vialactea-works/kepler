# Capability: propose

The skill that turns an idea into a change's proposal, requirements, and design through collaborative dialogue — the heavyweight front door of Hamilton's spec-driven pipeline.

## ADDED Requirements

### Requirement: Clarifying-questions dialogue delegates to grilling

The proposing skill SHALL delegate its clarifying-questions dialogue (step 4) to `hamilton-grilling`, supplying the question content (purpose, constraints, success criteria) and the exit condition "intent is clear" at the call site, rather than conducting the dialogue inline.

- Priority: must
- Rationale: `hamilton-grilling` owns the dialogue protocol (one question at a time, recommendation-led, facts looked up rather than asked). Conducting the dialogue inline duplicates that protocol in a second source of truth that drifts when grilling evolves.
- Reference: [Update propose and critique to use grilling](../../../maps/hamilton-wayfinder/tickets/12-propose-and-critique-use-grilling.md)

#### Scenario: Attended clarifying questions

- WHEN the skill runs attended and reaches step 4
- THEN it invokes `hamilton-grilling` with the clarifying questions as content and "intent is clear" as the exit condition

#### Scenario: Unattended clarifying questions

- WHEN the skill runs unattended and reaches step 4
- THEN it records a reasonable choice as an assumption and proceeds without invoking `hamilton-grilling`

### Requirement: Approach-choice dialogue delegates to grilling

The proposing skill SHALL delegate the approach-choice ask (step 7) to `hamilton-grilling`, supplying the question content (the 2–3 approaches and their trade-offs) and the exit condition "an approach is chosen" at the call site, while retaining responsibility for building the approaches.

- Priority: must
- Rationale: the choice between approaches is a human decision; the protocol for asking is grilling's. Propose still builds the approaches — only the ask delegates.

#### Scenario: Attended approach choice

- WHEN the skill runs attended and reaches step 7
- THEN it invokes `hamilton-grilling` with the approaches as content and "an approach is chosen" as the exit condition

#### Scenario: Unattended approach choice

- WHEN the skill runs unattended and reaches step 7
- THEN it picks the recommended approach, records the reasoning, and proceeds without invoking `hamilton-grilling`

### Requirement: Approval-loop dialogue delegates to grilling

The proposing skill SHALL delegate its approval-loop dialogue (step 10) to `hamilton-grilling`, supplying the question content (revision feedback) and the exit condition "artifacts approved" at the call site, so that revision items are walked one at a time rather than presented as a block.

- Priority: must
- Rationale: revision feedback walked one item at a time is more precise than a block presentation, and the one-at-a-time protocol is grilling's to run.

#### Scenario: Attended approval loop

- WHEN the skill runs attended and reaches step 10 with revision feedback
- THEN it invokes `hamilton-grilling` with the revision items as content and "artifacts approved" as the exit condition

#### Scenario: Unattended approval loop

- WHEN the skill runs unattended and reaches step 10
- THEN it records open questions and returns without invoking `hamilton-grilling`

### Requirement: Attendance guarded at each delegation call site

The proposing skill SHALL guard attendance at each of its three delegation call sites: attended → invoke `hamilton-grilling`; unattended → fall back to the behaviour the skill already documents (record a reasonable choice as an assumption, or record open questions).

- Priority: must
- Rationale: `hamilton-grilling` is strictly HITL and never gains an unattended mode — per [ticket 12](../../../maps/hamilton-wayfinder/tickets/12-propose-and-critique-use-grilling.md) and the [dialogue spec](../../../specs/dialogue.md). The attendance check belongs to the caller, not to grilling.

#### Scenario: Grilling invoked attended

- WHEN the skill runs attended and reaches a delegation call site
- THEN it invokes `hamilton-grilling`

#### Scenario: Grilling not invoked unattended

- WHEN the skill runs unattended and reaches a delegation call site
- THEN it does not invoke `hamilton-grilling` and falls back to recording an assumption or open questions

### Requirement: No dialogue-protocol duplication remains

The proposing skill SHALL NOT retain any dialogue-protocol instruction that `hamilton-grilling` owns — one question at a time, leading with a recommendation, looking facts up rather than asking, never answering for the human — in any section of the skill, including the Principles section and the process flow diagram.

- Priority: must
- Rationale: every protocol sentence left in propose after the delegation is duplication — a second source of truth that drifts when grilling's protocol evolves. This is the craft focus the [route](../../../maps/hamilton-wayfinder/route.md) warns about: removal is where skills rot.

#### Scenario: Principles section after edit

- WHEN the edited skill is read end-to-end
- THEN no sentence in the Principles section restates a protocol behaviour that `hamilton-grilling` owns

#### Scenario: Process flow diagram after edit

- WHEN the edited process flow diagram is read
- THEN no node label references the one-at-a-time protocol or any other grilling-owned behaviour

## MODIFIED Requirements

None. No canonical spec exists for the `propose` capability; the requirements above are the first formal tracking of the delegation behaviour.

## REMOVED Requirements

None.

## RENAMED Requirements

None.
