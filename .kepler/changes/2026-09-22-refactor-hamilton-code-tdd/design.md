---
artifact: design
change: 2026-09-22-refactor-hamilton-code-tdd
status: draft
created: 2026-09-22
author: Hermes Agent
decision: accepted
route_unit: null
---

# Design: Refactor hamilton-code Around a TDD Cycle

## Context

Hamilton's current task implementation skill already has durable boundaries: the plan owns ordered task steps, `hamilton-code` owns one task's implementation attempt and task-local evidence, `hamilton-code-feedback` owns a task-scoped verdict, and `hamilton-orchestrate` advances only from committed fresh evidence. The missing contract is within the implementation cycle. The skill says to execute task steps, verify, self-review, and commit, but it does not require the implementer to establish a failing check before production edits or make the review handoff part of refactoring.

The change is documentation and contract-test work in the Hamilton bundle itself. It must preserve the split execution layout, stable task checkpoint, append-only progress and feedback histories, artifact-only feedback commit, and whole-branch review gate. The existing durable state model means implementation code can commit a `done` attempt before task feedback is written; in this design, `done` continues to mean that the current implementation attempt is committed, while the task remains ungated until a fresh approved feedback pass exists.

Unattended execution supplies the human decisions that the proposal stage would ordinarily request. The selected approach is to strengthen the existing handoff rather than introduce a new artifact or runtime coordinator.

## Goals / Non-Goals

**Goals**

- Make red, green, and refactor explicit, ordered, and testable in `hamilton-code`.
- Require red/green/refactor evidence in task-local implementation notes so feedback receives the implementation context it needs.
- Make `hamilton-code-feedback` the named refactor-phase gate and make its verdict the only route to task advancement.
- Define a documented exception for tasks that cannot begin with a conventional failing test.
- Keep public framework documentation and contract tests aligned with the skill-level workflow.

**Non-Goals**

- No new task status, artifact, frontmatter field, CLI command, or persistence format.
- No automatic invocation mechanism inside the Hamilton CLI and no feedback reviewer that edits code.
- No replacement of plan-defined task Steps, task verification commands, or commit messages.
- No change to the whole-branch review or finish-work gates.

## Decisions

### Decision: Treat the TDD loop as an implementation contract, not a new artifact lifecycle

- Choice: Add a required red/green/refactor section to the `hamilton-code` process and require the task-local attempt to record the observed commands and results. Keep the existing root status and task-progress template shape unchanged; the new evidence lives in the attempt's notes.
- Alternatives considered: introduce a new `tdd.md` artifact, add new root task statuses for `green` and `refactoring`, or rely only on prose in the plan. A new artifact would create another owner and gate; new statuses would ripple through every workbench and finish contract; plan-only prose would not enforce the rule when a task is implemented inline.
- Rationale: The existing task-local attempt is already the owner of implementation evidence, and keeping the state model unchanged avoids weakening durable resume behavior while making the cycle explicit where the implementer acts.

### Decision: Make feedback the refactor gate through orchestration

- Choice: `hamilton-code` completes its implementation attempt only after its own behavior-preserving refactor and verification, then hands the stable committed diff and TDD evidence to `hamilton-code-feedback`. The orchestrator names this dispatch as the refactor-phase review. Only a fresh approved feedback pass permits advancement; a requested change returns the same task to a new `hamilton-code` correction attempt.
- Alternatives considered: have `hamilton-code` call the reviewer synchronously before committing, let the reviewer edit the implementation, or add a separate `hamilton-refactor` skill. Synchronous review would violate the existing artifact-only feedback commit and stable-diff boundary; reviewer edits would violate stage ownership; a new skill would duplicate the existing tactical gate.
- Rationale: The existing code→feedback loop already provides the correct durable state machine. Naming its role in the refactor phase makes the intended order explicit without changing ownership or requiring a new coordinator.

### Decision: Require an exception record rather than weakening red

- Choice: When no conventional failing test can be written, the implementer must state the concrete constraint before production edits and select a repeatable alternative verification that exercises observable behavior. The alternative must remain passing through refactoring and be supplied to feedback.
- Alternatives considered: exempt documentation and configuration tasks silently, accept a vague “not testable” note, or require every task to manufacture a unit test regardless of behavior. Silent exemptions and vague notes are not auditable; forced tests create meaningless coverage and encourage test theater.
- Rationale: A constrained but explicit exception preserves the purpose of red—proving intended behavior before implementation—without pretending every task has the same test shape.

### Decision: Keep task plans authoritative and layer the cycle around their steps

- Choice: The plan still supplies the exact task Steps, Verify command, acceptance, and commit message. `hamilton-code` applies red/green/refactor around those steps and does not redesign the task or invent a replacement test plan. Correction attempts use the feedback finding as their target and repeat the same cycle with fresh verification.
- Alternatives considered: rewrite every existing plan task to add a new standardized red/green/refactor section, or let the implementer redesign task steps that do not mention tests. A mass plan rewrite would change historical contracts and task identity; implementer-led redesign would violate the plan handoff.
- Rationale: This change is specifically a skill contract correction. The wrapper rule applies to existing and future plans while preserving their durable steps and evidence.

## Architecture & Components

| Unit | Responsibility | Interface and boundary |
|---|---|---|
| `skills/hamilton-code/SKILL.md` | Direct the red/green/refactor implementation cycle, exception path, evidence recording, and existing commit lifecycle | Consumes one exact plan task and its task-local state; does not own feedback or sibling artifacts |
| `skills/hamilton-code-feedback/SKILL.md` | Judge the behavior-preserving refactor against task requirements, standards, and recorded TDD evidence | Consumes one stable task diff plus latest task evidence; writes only the task feedback history and its artifact-only commit |
| `skills/hamilton-orchestrate/SKILL.md` | Route the implementation attempt into refactor-phase feedback and prevent advancement on missing or unapproved feedback | Reads durable root and feedback state; dispatches stage skills but never edits their artifacts |
| `skills/hamilton-orchestrate/references/implementer-prompt.md` | Pass phase evidence requirements to the implementer | Supplies only the exact task context and directs detailed evidence to task-local progress |
| `skills/hamilton-orchestrate/references/code-feedback-prompt.md` | Pass TDD evidence and refactor-gate purpose to the reviewer | Supplies the same stable range and bounded review context without expanding inspection scope |
| `tests/skills/*` | Detect ordering, exception, handoff, and correction-contract regressions | Reads skill and prompt text as the repository's existing contract-test seam |
| `docs/skills.md`, `docs/sdd-framework.md`, `docs/modes.md` | Present the public pipeline and per-task loop consistently | Documentation only; it must describe the implemented skill contract without adding a second workflow |

### Quality Lens

The design keeps each unit's one reason to change: implementation discipline belongs to `hamilton-code`, review judgment belongs to `hamilton-code-feedback`, routing belongs to orchestration, and reader-facing explanation belongs to docs. The existing stable diff and task-progress files are narrow seams for the reviewer; no concrete IO, new parser, or mutable coordinator is introduced. The right-sized choice is to avoid a new artifact, status, or skill because the current task and feedback owners already expose the required boundaries. The only accepted coupling is that orchestration labels its existing code-feedback dispatch as the refactor gate; this is the existing pipeline relationship, not a second implementation of review logic.

## Data & Flow

### Ordinary cycle

1. `hamilton-code` resolves one task and its stable checkpoint as it does today.
2. Before production edits, it identifies the intended observable behavior, writes or updates the smallest failing test or check, and records the red command and observed failure in the current task attempt evidence.
3. It makes the smallest implementation change, runs the focused check until it passes, and records the green result. A green result is explicitly intermediate.
4. It refactors the implementation without changing behavior, keeps the focused and relevant tests passing, runs the task Verify command and required project gates, and records the refactor verification.
5. It completes its normal self-review and implementation commit, including the task-local attempt and assigned root-row transition.
6. The driver dispatches `hamilton-code-feedback` as the refactor-phase review with the stable checkpoint-to-head diff and the latest TDD evidence.
7. Approved feedback permits advancement. Requested feedback remains the authoritative finding record and returns the same task to a new implementation attempt; that attempt addresses the finding, verifies it, and receives a fresh feedback pass before advancement.

### Exceptional cycle

1. Before editing, the implementer records why a conventional failing test cannot represent the intended behavior.
2. It defines a repeatable alternative verification tied to an observable result, runs that verification against the missing behavior or baseline where the environment permits, and records the observed result and limitation.
3. It implements the smallest change, reruns the alternative to establish green, and keeps it passing during refactor.
4. The same task verification, commit, feedback, and correction rules apply. Feedback explicitly judges whether the exception is genuine and whether the alternative is sufficient.

## Error Handling & Edge Cases

| Failure or edge case | Behavior |
|---|---|
| The implementer edits production code before a feasible red check is recorded | The attempt is incomplete; the implementer must stop, add the red evidence, or use the documented exception before proceeding. |
| The focused check passes after implementation but no refactor occurs | The attempt cannot be finalized as done; the implementer must refactor and rerun relevant checks. |
| Refactoring breaks a test | Restore the behavior-preserving implementation, correct the refactor, and rerun the focused and task verification before commit. |
| Feedback requests changes | Keep the feedback pass append-only, return the same task to `hamilton-code`, and address the finding in a new cycle; do not edit the old pass or advance. |
| A conventional test is claimed impossible without a concrete reason or repeatable alternative | Treat the exception as invalid and block completion until the evidence is supplied. |
| Feedback cannot verify the TDD or alternative-verification evidence | Record the normal blocking finding under the task feedback contract; the driver must not advance on an unverified refactor. |
| A correction is purely structural and no new behavioral test can distinguish it | Reuse the existing behavior test or add a contract/quality check where possible; record why a new failing test is not meaningful and run the narrowest repeatable alternative. |

## Testing Strategy

Add contract tests that read `hamilton-code` and assert the explicit red → green → refactor ordering, the green-only prohibition, phase evidence requirements, correction-cycle behavior, and the justified alternative-verification path. Extend code-feedback and orchestration contract tests to assert that the reviewer receives task-local TDD evidence, is named as the refactor gate, and must approve before task advancement. Add documentation assertions or focused checks for the public loop description and exceptional path.

The change uses no production runtime code. Run the focused skill and documentation suites while iterating, then `bun --bun vitest run` and `bun run build`. The resulting change still passes the normal `hamilton-code` → `hamilton-code-feedback` task loop, `hamilton-review`, and `hamilton-finish-work` gates; feedback remains judge-only and whole-branch review remains distinct.

## Constraints & Boundaries

- Always: follow the plan's task Steps and Verify command; record red, green, refactor, or exception evidence in the assigned task log; keep the existing checkpoint and commit conventions; send the stable implementation to `hamilton-code-feedback` before advancement; rerun relevant verification after feedback-driven corrections.
- Ask first: none in unattended execution; if an implementation encounters a public-interface or task-scope decision not covered by the plan, use the existing Hamilton blocked path rather than inventing a new contract.
- Never: treat green as complete; silently skip the red phase; let feedback edit implementation or progress; rewrite prior feedback; add a new status or artifact solely for this loop; weaken tests to manufacture a red/green result; or bypass whole-branch review.

## Risks / Trade-offs

- [Some plan tasks may not state a natural first failing test] -> Require the implementer to derive a focused behavioral check from acceptance criteria, or record a concrete exception and alternative verification rather than silently skipping red.
- [The current durable state marks an implementation attempt done before feedback] -> Define `done` as committed implementation-attempt completion and make the orchestrator's fresh approved feedback predicate the task-advancement gate; preserve the existing split evidence contract.
- [The extra evidence may be reported inconsistently] -> State the required red/green/refactor or exception fields in the skill and dispatch prompts, and assert the wording and order in contract tests.

## Migration / Rollout

The change is a between-bundle skill update. Existing active changes keep using the generation that created their plans; new or resumed changes after the skills are updated follow the strengthened cycle. No project artifact migration is required because task progress, feedback, checkpoints, and statuses retain their current shapes. Update the bundled skills and public docs together so an agent never receives the old implementation instructions with the new refactor gate.

## Open Questions

*(none)*
