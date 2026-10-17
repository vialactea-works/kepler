# Construction phase: SDD framework

[Workflow phase index](../README.md)

## Purpose

Construction operates on one Unit of Work. Its stages define responsibilities independently of the skills and agents that support them.

The stage order and execution structure are agreed. Detailed stage contracts remain under development. The Functional Design contract remains a draft until the requester accepts it as a whole.

## Stage outline

This table gives the unit-scoped stage order. Task-scoped stages execute inside Implementation Execution.

| Order | Stage | Contract status |
| --- | --- | --- |
| 1 | [Functional Design](functional-design.md) | Draft for discussion. |
| 2 | Non-functional Requirements | Name agreed. Contract not yet defined. |
| 3 | Implementation Planning | Name agreed. Contract not yet defined. |
| 4 | [Implementation Execution](#implementation-execution) | Structure agreed. Detailed contract not yet defined. |
| 5 | Unit of Work Review | Contract not yet defined. |
| 6 | Deliver | Contract not yet defined. |

## Agreed boundaries

Project preparation belongs to the Initialization phase.

Functional Design defines domain behavior, the domain model, and functional contracts in `design.md`.

Non-functional Requirements defines quality targets and constraints in `.kepler/units-of-work/<unit-id>/quality.md`. This document is required for that stage. Applicable requirements include performance, availability, security, accessibility, compatibility, operability, and observability.

Implementation Planning selects the technical solution against the functional design and non-functional requirements. It then divides the work into implementation tasks. It produces a task plan that represents tasks and their dependencies as a graph. The graph format and location of the technical design record require separate decisions.

Code Generation runs tests related to its modifications. Code Validation runs the complete application test suite and owns independent code feedback.

Code Generation and Code Validation form the Task coding loop inside each task implementation. Unit of Work Review examines the complete integrated result after Implementation Execution.

## Implementation Execution

Implementation Execution is a unit-scoped stage. The orchestrator executes the task graph and coordinates task implementation, integration, and completion.

Start tasks when their required predecessor outputs are available in the unit's integrated state. Independent, ready task loops run concurrently. Follow the shared [task admission and baseline rules](../runtime.md#task-admission-and-baselines).

This diagram is illustrative. Task K represents one task, not a required task identifier format.

```text
Implementation Execution
  Task K implementation
    Task coding
      Code Generation <-> Code Validation
      Exit: required validation succeeds; no blocking findings remain
    Task Integration
      Exit: output is integrated; required combined-result checks succeed
```

This nested execution structure belongs to Construction. Do not infer the same relationship for other phases or stages.

### Task coding

Task implementation and Task coding are execution contexts, not additional stages. They do not introduce separate stage-attempt identities. The task keeps its identity through its coding and integration loops.

Code Generation and Code Validation are task-scoped stages. A task implementation can contain several attempts of each stage.

Complete Task coding only when required validation succeeds and no blocking findings remain. Missing required validation does not satisfy this condition. Coding completion makes the task ready for integration; it does not complete the whole task implementation.

Internal corrections within one stage remain in its attempt. An authorized return to a stage creates a new attempt when that stage executes again. Follow the shared [attempt rules](../runtime.md#stage-attempts).

### Task Integration

Task Integration is a task-scoped stage after successful Task coding. Prepare the combined candidate, check it, then accept it as the unit's integrated state.

Separate worker results do not establish combined correctness. Retain the checked candidate, integrated checkpoint, and supporting evidence under the shared [integration and verification rules](../runtime.md#integration-and-verification).

#### Integration order and locking

Use one integration lock per unit. All task integrations targeting that unit's integrated state must use the same lock. Other operations that change its integrated state must also respect that lock.

1. **Acquire the lock.** Wait for the unit's integration lock before preparing a candidate.
2. **Prepare the candidate.** Read the current unit integration checkpoint after acquiring the lock. Combine it with the task output. Record these integration inputs separately from the task's fixed admission baseline.
3. **Check the candidate.** Run the project build and full application test suite against that candidate. Both must complete successfully. Bind the results to the checked material and relevant inputs.
4. **Accept the candidate.** Only after the required checks succeed, make the checked candidate the unit's integrated state. A candidate with failed or incomplete required checks must not replace that state.
5. **Release the lock.** Release it when the integration operation ends. Do not retain it during a return to Task coding.

Hold the lock through preparation, checks, and acceptance. Integration checks for the same unit are therefore serialized. This replaces the earlier restriction to short integration updates.

Candidate acceptance means updating the unit's integrated state. It is not requester approval.

Complete the task implementation only after successful acceptance and satisfaction of its completion conditions. Dependent tasks can then use that integrated output under their admission conditions.

Do not use this lock as a task admission gate. Code Generation, Code Validation, and integrations for other units retain their permitted parallelism. Independent task loops continue while their inputs and contracts remain valid.

Lock ownership does not introduce another attempt identity or run floor.

### Return paths

Integration agents report findings and proposed correction boundaries. The orchestrator authorizes reopening under the shared [revision authority rules](../revision.md#authority-and-escalation).

| Finding | Route |
| --- | --- |
| Task implementation output needs changes for integration. | The orchestrator authorizes a return to Task coding. Execute Code Generation, Code Validation, and Task Integration again. |
| An integration-only operation needs a retry. | Continue within the current Task Integration attempt. A failed command alone does not create another attempt. |
| A finding invalidates an upstream contract. | The orchestrator selects the affected scope and earliest stage, then applies the shared revision procedure. |

A task-local return does not itself start another Implementation Execution attempt. Independent task loops continue while their inputs and contracts remain valid.

### Unit-wide upstream revision

When the orchestrator authorizes a unit-wide revision from Implementation Planning or an earlier stage, stop the unit's implementation work.

1. **Stop task work.** Stop new task admissions and all active task execution for that unit. This includes Task Integration.
2. **End the attempts.** End any active Implementation Execution attempt and all active task-stage attempts for that unit. Preserve existing work and evidence as history. Do not pause these attempts for later continuation. Ended attempts must not complete tasks or accept integration candidates.
3. **Execute the revised stages.** Follow the shared [Revision procedure](../revision.md#revision-procedure). Restart Implementation Execution only after the revised upstream stages complete. Start new Implementation Execution and task-stage attempts when their stages execute again.

Independent units continue while their inputs and contracts remain valid. Task-local corrections retain the [existing return paths](#return-paths). They do not trigger this unit-wide stopping procedure.

### Attempts and completion

Implementation Execution has a unit-scoped attempt. Code Generation, Code Validation, and Task Integration have task-scoped attempts within that execution. Several task-stage attempts can belong to the same active Implementation Execution attempt.

Use each stage attempt's identity as its [run floor](../runtime.md#run-floor). Task implementation and Task coding do not add another run floor.

Complete Implementation Execution when required task implementations are complete and the integrated unit result satisfies its required checks. The result is then ready for Unit of Work Review, not automatically approved for delivery.

This structure does not introduce an additional requester approval gate. Define approval conditions in the applicable stage contracts.

### Remaining stage contracts

Still define the task graph representation, detailed stage conditions, artifacts, agents, skills, and reopening questionnaires. The project build and full application test suite are required integration checks. Any additional integration checks and project-specific check configuration require separate decisions. Candidate checks precede acceptance under the agreed integration procedure.

Lock implementation, ownership records, coordination across workspaces, and interrupted-lock recovery remain open in the shared CLI infrastructure contract.

Detailed task-state transitions, dependency invalidation, shutdown coordination, and interrupted-work recovery require separate decisions.

## Draft use

Read the stage contract before proposing changes to its supporting skills or CLI features. A saved draft does not authorize implementation, delivery, or changes to existing runtime gates.
