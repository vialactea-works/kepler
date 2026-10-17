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

Task Integration is a task-scoped stage after successful Task coding. Combine the task output with the unit's integrated state and obtain the required checks for the combined result.

Separate worker results do not establish combined correctness. Record the actual integration inputs separately from the task's fixed admission baseline. Retain the integrated checkpoint and supporting evidence under the shared [integration and verification rules](../runtime.md#integration-and-verification).

Complete the task implementation only after its output is integrated and the required combined-result checks succeed. Dependent tasks can use that integrated output under their admission conditions.

Keep integration coordination narrow. Do not hold shared locks while agents or checks run. Independent task loops can continue while their inputs and contracts remain valid.

### Return paths

Integration agents report findings and proposed correction boundaries. The orchestrator authorizes reopening under the shared [revision authority rules](../revision.md#authority-and-escalation).

| Finding | Route |
| --- | --- |
| Task implementation output needs changes for integration. | The orchestrator authorizes a return to Task coding. Execute Code Generation, Code Validation, and Task Integration again. |
| An integration-only operation needs a retry. | Continue within the current Task Integration attempt. A failed command alone does not create another attempt. |
| A finding invalidates an upstream contract. | The orchestrator selects the affected scope and earliest stage, then applies the shared revision procedure. |

A task-local return does not itself start another Implementation Execution attempt. Independent task loops continue while their inputs and contracts remain valid.

### Attempts and completion

Implementation Execution has a unit-scoped attempt. Code Generation, Code Validation, and Task Integration have task-scoped attempts within that execution. Several task-stage attempts can belong to the same active Implementation Execution attempt.

Use each stage attempt's identity as its [run floor](../runtime.md#run-floor). Task implementation and Task coding do not add another run floor.

Complete Implementation Execution when required task implementations are complete and the integrated unit result satisfies its required checks. The result is then ready for Unit of Work Review, not automatically approved for delivery.

This structure does not introduce an additional requester approval gate. Define approval conditions in the applicable stage contracts.

### Remaining stage contracts

Still define the task graph representation, detailed stage conditions, artifacts, agents, skills, and reopening questionnaires. Exact integration checks, their allocation between Code Validation and Task Integration, and validation timing remain open.

Detailed task-state transitions, dependency invalidation, interrupted-work recovery, and handling of running tasks during unit-wide reopening require separate decisions.

## Draft use

Read the stage contract before proposing changes to its supporting skills or CLI features. A saved draft does not authorize implementation, delivery, or changes to existing runtime gates.
