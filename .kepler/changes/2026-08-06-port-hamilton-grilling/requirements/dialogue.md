# Capability: dialogue

The human-in-the-loop questioning protocol Hamilton skills use to resolve open decisions with a person — and the boundary that keeps it reusable by any caller.

## ADDED Requirements

### Requirement: One question at a time

The dialogue protocol SHALL put exactly one question to the human and wait for that question's answer before putting the next one.

- Priority: must
- Rationale: asking several at once is bewildering and collapses the branch-by-branch walk the protocol depends on. This is the protocol's defining behavior — every other requirement here modifies how a single question is posed or answered.

#### Scenario: Several open decisions

- WHEN the protocol holds more than one unresolved decision
- THEN it emits the first question alone, and emits no further question until the human has answered it

#### Scenario: Dependent decisions

- WHEN one decision's phrasing depends on how an earlier decision is resolved
- THEN the earlier decision is put first and its answer is in hand before the dependent question is composed

### Requirement: Every question leads with a recommendation

The dialogue protocol SHALL accompany each question with its own recommended answer.

- Priority: must
- Rationale: a bare question makes the human do the generative work. A recommendation gives them something to accept, reject, or correct, which is faster and surfaces disagreement sooner.

#### Scenario: A question is posed

- WHEN the protocol puts a question to the human
- THEN the question carries the recommended answer alongside it

### Requirement: Facts are looked up, decisions are asked

The dialogue protocol SHALL resolve from the environment any fact discoverable there, and SHALL reserve its questions for decisions.

- Priority: must
- Rationale: spending the human's attention on something the filesystem or a tool can answer wastes the one resource the protocol exists to conserve.

#### Scenario: The unknown is a discoverable fact

- WHEN what the protocol lacks can be established by reading the filesystem or calling an available tool
- THEN it establishes the fact itself and asks the human nothing about it

#### Scenario: The unknown is a decision

- WHEN what the protocol lacks is a choice between defensible options rather than a discoverable fact
- THEN it puts the choice to the human and waits for their answer

### Requirement: The human's side is never answered for them

The dialogue protocol SHALL NOT supply, assume, or proceed past a human's answer to a decision on the human's behalf.

- Priority: must
- Rationale: a protocol that answers its own questions has silently become an unattended agent while still claiming a human decided. Recommending an answer is not the same as recording one.

#### Scenario: No answer arrives

- WHEN a question has been put and the human has not answered it
- THEN the protocol neither adopts its own recommendation as the answer nor moves to the next question

### Requirement: No action before confirmed shared understanding

The dialogue protocol SHALL NOT act on what the dialogue has established until the human confirms that shared understanding is reached.

- Priority: must
- Rationale: the protocol's value is the human's judgement, which is forfeited if the agent starts building while the interview is still running. This governs whether the agent may act, not which question ends the dialogue — the caller decides that.

#### Scenario: The picture looks complete to the agent

- WHEN the protocol judges the remaining questions to be settled but the human has not confirmed
- THEN it takes no action on the subject of the dialogue

#### Scenario: The human confirms

- WHEN the human confirms shared understanding is reached
- THEN the protocol is free to act, and control returns to the caller

### Requirement: The protocol is caller-agnostic

The dialogue protocol SHALL confine itself to how a question is asked and answered, taking the content of each question and the condition that ends the dialogue from its caller.

- Priority: must
- Rationale: three callers are coming — wayfinder, propose, and critique — each with different subject matter and a different stopping point. A protocol that names approaches, artifacts, findings, or pipeline steps would fit one caller and have to be worked around by the others.
- Reference: [Propose and critique use grilling](../../../maps/hamilton-wayfinder/tickets/12-propose-and-critique-use-grilling.md)

#### Scenario: An unrelated caller invokes it

- WHEN a caller with no connection to the Hamilton pipeline or to wayfinder invokes the protocol
- THEN the protocol applies unchanged, requiring no vocabulary the caller does not already have

#### Scenario: The dialogue's stopping point

- WHEN the caller's exit condition is met
- THEN the dialogue ends on the caller's judgement; the protocol itself defines no such condition

### Requirement: Reachable by other skills

The dialogue protocol SHALL be invocable both by a person directly and by another skill, and SHALL NOT be configured in a way that removes it from other skills' reach.

- Priority: must
- Rationale: skill-to-skill reach is the reason this capability exists as a shared skill rather than as three copies. Suppressing model invocation would strip it from callers as well as from the agent, defeating the decision that placed it at the Hamilton level.

#### Scenario: Another skill reaches for it

- WHEN a skill needs the human's decisions and invokes the protocol by name
- THEN the invocation resolves and the protocol runs

#### Scenario: A person invokes it directly

- WHEN a person invokes the protocol by name to stress-test a plan, decision, or idea
- THEN the protocol runs identically — there is no second mode

### Requirement: The protocol text is upstream's, unmodified

The instruction text stating the protocol SHALL be the upstream `grilling` skill's own wording, altered only across the adaptation surface: frontmatter, naming, invocation mode, the provenance pointer, and re-homed paths.

- Priority: must
- Rationale: the route requires ports be verbatim rather than trimmed, so that the forked text stays diffable against upstream and improvements can be traced in either direction.
- Reference: [Which siblings to port](../../../maps/hamilton-wayfinder/tickets/07-which-siblings-to-port.md)

#### Scenario: Diffed against upstream

- WHEN the ported instruction paragraphs are compared against upstream's `grilling/SKILL.md`
- THEN they are identical, with differences confined to the adaptation surface

#### Scenario: Non-protocol upstream material

- WHEN upstream ships a file that carries host packaging metadata rather than protocol instructions
- THEN it is not part of the ported protocol text and does not travel with the skill

## MODIFIED Requirements

None.

## REMOVED Requirements

None.

## RENAMED Requirements

None.
