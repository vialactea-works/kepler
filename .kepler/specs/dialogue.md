# Capability: dialogue

## Overview

The human-in-the-loop questioning protocol Hamilton skills reach for when a change turns on decisions only a person can make. It interviews relentlessly down each branch of the decision tree, one question at a time, and resolves the dependencies between decisions in order. Its value is the human's judgement, so everything it does is arranged to spend the human's attention on decisions and nothing else. It is a shared primitive rather than a step in the pipeline: it owns *how* a question is asked and answered, and takes *what* is asked and *when* to stop from whoever called it. That boundary is what lets unrelated callers — pipeline steps, wayfinder tickets, a person stress-testing an idea — use it without inheriting each other's vocabulary.

## Contract

The protocol takes no parameters and has exactly one mode. Its whole interface is a division of ownership with the caller:

| surface | owner |
|---------|-------|
| how a question is posed, and what constitutes an answer | the protocol |
| the content of each question — the subject matter under discussion | the caller |
| the condition that ends the dialogue | the caller |
| whether a human is present to answer at all | the caller |

It is reachable both by a person invoking it directly and by another skill invoking it by name, and the two paths run the same protocol. Skill-to-skill reach is the reason the capability is shared rather than duplicated per caller, so it is never configured in a way that withholds it from other skills.

## Behavior

The protocol puts exactly one question to the human and waits for that question's answer before composing the next. Where one decision's phrasing depends on how an earlier one resolves, the earlier is put first and its answer is in hand before the dependent question is written — the branch-by-branch walk is the point, and asking several questions at once collapses it.

Every question carries the protocol's own recommended answer alongside it. A bare question makes the human do the generative work; a recommendation gives them something to accept, reject, or correct, which is faster and surfaces disagreement sooner. A recommendation is not an answer, though: the protocol never adopts its own suggestion, assumes a reply, or moves past an unanswered question on the human's behalf. An agent that answers its own questions has quietly become unattended while still claiming a human decided.

Before asking anything, the protocol establishes whatever it can for itself. Anything discoverable by reading the filesystem or calling an available tool is a fact, and it is looked up rather than asked. Questions are reserved for decisions — choices between defensible options, where no amount of environment inspection produces the answer.

Acting on what the dialogue has established waits for the human to confirm that shared understanding is reached, however complete the picture looks to the agent. This is a don't-act-yet rule rather than a loop-termination rule, so it holds alongside the caller's exit condition rather than competing with it: the exit condition governs which question ends the dialogue, and confirmation governs whether the agent may start building. When the caller's condition is met and the human has confirmed, the protocol is free to act and control returns to the caller. The protocol itself defines no stopping point.

Invoked with no human present, the protocol stalls waiting for an answer. That is correct behavior for a HITL primitive rather than a defect — the attendance check belongs to the caller, which knows whether it is running attended.

**Examples**

- more than one decision open -> the first question is emitted alone, and no further question until the human answers it
- a question's phrasing depends on an earlier decision -> the earlier decision is put first and answered before the dependent question is composed
- any question is posed -> it carries the protocol's recommended answer alongside it
- the unknown is establishable from the filesystem or an available tool -> established directly; the human is asked nothing about it
- the unknown is a choice between defensible options -> put to the human, and the protocol waits
- a question is put and no answer arrives -> the recommendation is not adopted as the answer, and no next question is emitted
- the agent judges the remaining questions settled but the human has not confirmed -> no action is taken on the subject of the dialogue
- the human confirms shared understanding -> the protocol is free to act, and control returns to the caller
- the caller's exit condition is met -> the dialogue ends on the caller's judgement
- a caller with no connection to the pipeline or to wayfinder invokes it -> the protocol applies unchanged, requiring no vocabulary that caller lacks
- another skill invokes it by name -> the invocation resolves and the protocol runs
- a person invokes it directly to stress-test a plan or idea -> the protocol runs identically; there is no second mode
- invoked with no human present -> it stalls awaiting an answer rather than proceeding

## Invariants

- Exactly one question is outstanding at a time. The protocol MUST NOT emit the next question before the current one has been answered.
- The protocol MUST NEVER supply, assume, or proceed past a human's answer to a decision on that human's behalf. Recommending an answer is NEVER the same as recording one.
- No action is taken on the subject of the dialogue until the human confirms shared understanding.
- The protocol MUST name no approach, artifact, finding, or pipeline step. Anything that would require one caller's vocabulary belongs at that caller's call site.
- The protocol MUST remain reachable by other skills, and MUST NEVER be configured in a way that removes it from their reach — including configurations adopted for unrelated benefits such as reducing permanent context load.
- The instruction text stating the protocol is upstream `grilling`'s own wording, and MUST stay byte-identical to it. Alterations are confined to the adaptation surface — frontmatter, naming, invocation mode, the provenance pointer, and re-homed paths — so the fork stays diffable against upstream in both directions.

## Decisions

- **The protocol owns the how; the caller owns the what and the when.** Question content and the exit condition come from the caller, because callers differ in subject matter and in what counts as done. A protocol that named approaches, artifacts, findings, or pipeline steps would fit exactly one of them and be worked around by the rest. When a caller needs behavior the protocol does not have, add it at the call site rather than parameterising the protocol.
- **Don't-act-until-confirmed is orthogonal to the exit condition.** The two rules govern different things — whether the agent may begin work, versus which question ends the dialogue — and both hold at once. The confirmation rule is the only thing in the protocol that stops an agent answering its own questions and proceeding, so it is not traded away to simplify the caller boundary.
- **One behavior, and no unattended fallback.** The protocol never gains a second mode for the case where no human is present; the attendance check is the caller's. A HITL primitive that degrades into answering itself has stopped being one, and the degradation is invisible at exactly the moment it matters.
- **Reach decides invocation mode.** Because skill-to-skill reach is why this capability was placed at the Hamilton level rather than inside a single caller, any configuration that would strip it from other skills' reach is unavailable regardless of what else it buys.
- **Host packaging metadata does not travel with a forked protocol.** A verbatim port covers the instruction text the agent reads, not sidecar files describing the skill to some other agent host's interface. Porting those would create an untested one-off that every subsequent fork then has to decide about, while changing no specified behavior.
