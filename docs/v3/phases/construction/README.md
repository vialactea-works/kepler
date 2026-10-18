# Construction phase: SDD framework

[Workflow phase index](../../README.md)

## Purpose

Construction operates on one Unit of Work. Its stages define responsibilities independently of the skills and agents that support them.

Construction owns its execution state model and projection schemas under the shared [execution-state representation](../../runtime.md#execution-state-representation).

The [Standard workflow](../../workflows/standard/README.md) selects the unit-stage order. Construction owns the stage definitions and agreed Implementation Execution structure. The requester has accepted the Functional Design and Quality Requirements stage specifications. The other four unit-stage contracts have drafts for discussion; their remaining proposals are not accepted. Code Generation, Code Validation, and Code Integration are Activities within Implementation Execution, not additional stages.

## Stage catalog

These stages belong to Construction. The catalog defines ownership, not an order for every workflow. See [Standard's selected sequence](../../workflows/standard/README.md#stages) for the Construction MVP.

| Stage | Contract status |
| --- | --- |
| [Deliver](deliver.md) | Draft for discussion, including proposed deployment information and operation boundaries. |
| [Functional Design](functional-design.md) | Accepted by the requester. |
| [Implementation Execution](implementation-execution.md) | Structure and shared execution rules agreed. Detailed stage and Activity contracts remain proposals. |
| [Implementation Planning](implementation-planning.md) | Draft for discussion. The task graph specification is accepted; remaining stage policies stay proposed. |
| [Quality Requirements](quality-requirements.md) | Accepted by the requester under [NF12](../../authoring_progress.md#quality-requirements-decisions). |
| [Unit of Work Review](unit-of-work-review.md) | Whole integrated result is the agreed scope. Remaining contract is a draft proposal. |

## Agreed boundaries

Project preparation belongs to the Initialization phase.

Functional Design defines domain behavior, the domain model, and functional contracts in `design.md`.

Quality Requirements defines quality targets and constraints in `.kepler/units-of-work/<unit-id>/quality.md`. This document is required for that stage. Applicable requirements include performance, availability, security, accessibility, compatibility, operability, observability, and maintainability.

Implementation Planning selects the technical solution against the functional design and quality requirements. It then divides the work into implementation tasks. It produces `plan.md` with technical rationale and `tasks-dag.json` with the task graph at the unit root. The [stage draft](implementation-planning.md) defines the agreed artifact split and proposes the remaining contract. Use the [accepted task graph specification](task-graph.md) with UUIDv4 task IDs.

Code Generation runs typechecking, tests related to its modifications, and author self-review. Code Validation runs typechecking, the project build, and the full application test suite. A non-author reviewer supplies independent feedback without editing the candidate. Code Integration runs the same three checks against the combined candidate under the unit lock.

For each task, Implementation Execution runs Code Generation, Code Validation, then Code Integration. Their [compact Activity contracts](activities/README.md) keep shared rules separate from Activity-specific responsibilities. Standard routes the completed integrated result to Unit of Work Review.

## Implementation Execution

The [unit-stage draft](implementation-execution.md) adds proposed details for Execution. Dedicated [Generation](activities/code-generation.md), [Validation](activities/code-validation.md), and [Integration](activities/code-integration.md) contracts define their Activity responsibilities. Their classification as Activities and the agreed rules below are binding; the remaining contract details stay proposed.

Implementation Execution is a unit-scoped stage. The orchestrator executes the task graph and coordinates task implementation, integration, and completion.

Start tasks when their required predecessor outputs are available in the unit's integrated state. Independent, ready task loops run concurrently. Follow the shared [task admission and baseline rules](../../runtime.md#task-admission-and-baselines).

This diagram is illustrative. Task K represents one task, not a required task identifier format. Activities are steps inside the task's Implementation Execution scope.

```text
Implementation Execution
  Task K
    Code Generation -> Code Validation -> Code Integration
    Correction: authorized return to Code Generation, then repeat required Activities
    Exit: accepted integration and task contract are complete
```

This nested execution structure belongs to Construction. Do not infer the same relationship for other phases or stages.

### Task coding

Task implementation and Task coding are execution contexts, not additional stages or Activities. They add no task-coding attempt identity. The task keeps its identity through the fixed Activity sequence.

Code Generation, Code Validation, and Code Integration are task-scoped Activities. Each Activity occurrence can have several attempts within the same active Implementation Execution attempt.

Code Validation succeeds only when its required checks and independent non-author feedback are complete and no blocking findings remain. This makes the task eligible for Code Integration; it does not complete the task or Implementation Execution.

Internal corrections within an Activity remain in its attempt. An authorized return creates a new Activity attempt when that Activity executes again. Follow the shared [Activity attempt rules](../../runtime.md#activity-attempts).

### Code Integration

Code Integration is a task-scoped Activity after successful Code Validation. Prepare the combined candidate, check it, then accept it as the unit's integrated state.

The [dedicated Activity contract](activities/code-integration.md) defines Integration's procedures, evidence, completion conditions, and coordination handoff. These details remain proposed.

Separate worker results do not establish combined correctness. Retain the checked candidate, integrated checkpoint, and supporting evidence under the shared [integration and verification rules](../../runtime.md#integration-and-verification).

#### Integration order and locking

Use one integration lock per unit. All task integrations targeting that unit's integrated state must use the same lock. Other operations that change its integrated state must also respect that lock.

1. **Acquire the lock.** Wait for the unit's integration lock. Do not read the current integrated checkpoint before acquiring the lock.
2. **Prepare the candidate.** Read the current unit checkpoint after acquiring the lock. Combine it with the validated task output. Record actual Integration inputs separately from the task's fixed admission baseline.
3. **Check the candidate.** Run typechecking, the project build, and the full application test suite against that candidate. All three must complete successfully. Bind the results to the checked material and actual inputs.
4. **Accept the candidate.** Use authorized orchestrator and CLI operations to accept only the checked candidate. If its bytes change, run the required checks against the changed candidate before acceptance.
5. **Release the lock.** Release it when the Integration operation ends. Do not retain it during a return to Code Generation.

Hold the lock through preparation, checks, and acceptance. Integration checks for the same unit are therefore serialized. This replaces the earlier restriction to short integration updates.

Candidate acceptance means updating the unit's integrated state. It is not requester approval.

The orchestrator records task completion only after successful acceptance and satisfaction of the task's completion conditions. Dependent tasks can then use that integrated output under the accepted dependency graph and admission rules.

Do not use this lock as a task admission gate. Code Generation, Code Validation, and Activities in other units retain their permitted parallelism. Independent tasks continue while their inputs and contracts remain valid.

Lock ownership does not introduce another attempt identity or run floor.

### Return paths

Code Integration workers report findings and proposed correction boundaries. The orchestrator authorizes returns under the shared [revision authority rules](../../revision.md#authority-and-escalation).

| Finding | Route |
| --- | --- |
| Task implementation output needs changes for Integration. | The orchestrator authorizes a return to Code Generation. Execute Code Generation, Code Validation, and Code Integration again. |
| An Integration-only operation needs a retry. | Continue within the current Code Integration attempt. A failed command alone does not create another attempt. |
| A finding invalidates an upstream contract. | The orchestrator selects the affected scope and earliest stage, then applies the shared revision procedure. |

A task-local return does not itself start another Implementation Execution attempt. Independent task loops continue while their inputs and contracts remain valid.

### Unit-wide upstream revision

When the orchestrator authorizes a unit-wide revision from Implementation Planning or an earlier stage, stop the unit's implementation work.

1. **Stop task work.** Stop new task admissions and all active task execution for that unit. This includes Code Integration.
2. **End the attempts.** End any active Implementation Execution attempt and all active Activity attempts for that unit. Preserve existing work and evidence as history. Do not pause these attempts for later continuation. Ended attempts must not complete tasks or accept integration candidates.
3. **Execute the revised stages.** Follow the shared [Revision procedure](../../revision.md#revision-procedure). Restart Implementation Execution only after the revised upstream stages complete. Start new Implementation Execution and Activity attempts when their stage or Activity executes again.

Independent units continue while their inputs and contracts remain valid. Task-local corrections retain the [existing return paths](#return-paths). They do not trigger this unit-wide stopping procedure.

### Attempts and completion

Implementation Execution has a unit-scoped attempt. Within that attempt, the task and Activity definition identify one fixed Activity occurrence. Each occurrence can have several Activity attempts, but only one can be active. Several Activity attempts can belong to the same active Implementation Execution attempt.

Use each Activity attempt's identity as its [run floor](../../runtime.md#run-floor). Task implementation and Task coding do not add another attempt identity or run floor.

Complete Implementation Execution when required task implementations are complete and the integrated unit result satisfies its required checks. The result is then ready for Unit of Work Review, not automatically approved for delivery.

Tasks are accepted through successful Code Validation and Code Integration, not routine requester approval. Ask the requester only for [hard blockers](implementation-execution.md#requester-intervention) that require requester input. Continue independent ready work while affected work waits.

### Remaining stage contracts

Review the proposed [Planning](implementation-planning.md), [Execution](implementation-execution.md), [Unit of Work Review](unit-of-work-review.md), and [Deliver](deliver.md) contracts. Each draft proposes evidence coverage, completion conditions, role and skill assignments, reopening questions, and handoffs. These details remain proposed. The task graph writer and validator remain implementation work.

Typechecking, the project build, and the full application test suite remain required integration checks. Additional applicable obligations remain binding; general extra-check policy is deferred. Project check configuration remains MVP implementation work. Candidate checks precede acceptance under the agreed integration procedure.

Lock implementation, ownership records, coordination across workspaces, and interrupted-lock recovery remain open in the shared CLI infrastructure contract.

Detailed task-state transitions, dependency invalidation, and shutdown coordination require separate decisions. Interrupted work follows the shared [recovery rule](../../runtime.md#interrupted-work-recovery).

## Draft use

Read the stage contract before proposing changes to its supporting skills or CLI features. A saved draft does not authorize implementation, delivery, or changes to existing runtime gates.
