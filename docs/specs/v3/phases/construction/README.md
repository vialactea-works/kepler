# Construction phase: SDD framework

[Workflow phase index](../../README.md)

## Purpose

Construction operates on one Unit of Work. Standard has one unit per mission. The [Mission contract](../../mission.md) sets mission startup and workspace facts. Each stage has its own responsibilities and assigned skills and agents.

Construction owns its execution state model and projection schemas under the shared [execution-state representation](../../runtime.md#execution-state-representation). The [Construction runtime draft](runtime.md) proposes remaining derived states, lifecycle guards, and event facts. It also records accepted DF14-DF17 rules for check commands, task transitions, dependency invalidation, and revision shutdown. The [Mission contract](../../mission.md) owns accepted mission and storage policy. The runtime draft adds no stage.

The [Standard workflow](../../workflows/standard/README.md) selects the unit-stage order. Construction owns the stage definitions and Implementation structure. The requester accepted Functional Design and Quality Requirements under FD13 and NF12. Implementation Planning and Implementation are accepted under IP19 and IE21. Unit of Work Review and Deliver are accepted under UR16 and DL18. The requester separately accepted Code Generation under IE24, Code Validation under IE25, and Code Integration under IE27.

These are specification approvals, not approval of an executing unit or implementation. Code Generation, Code Validation, and Code Integration are Activities within Implementation, not additional stages.

## Stage catalog

These stages belong to Construction. The catalog states ownership, not an order for every workflow. See [Standard's selected sequence](../../workflows/standard/README.md#stages) for its stage order.

| Stage | Contract status |
| --- | --- |
| [Deliver](deliver.md) | Accepted by the requester under [DL18](../../authoring_progress.md#deliver-decisions). Deployment policy is recorded under SH77-SH79. |
| [Functional Design](functional-design.md) | Accepted by the requester. |
| [Implementation](implementation.md) | Accepted by the requester under [IE21](../../authoring_progress.md#completed-implementation-decisions). Its Activities have separate whole-contract approvals. |
| [Implementation Planning](implementation-planning.md) | Accepted by the requester under [IP19](../../authoring_progress.md#implementation-planning-decisions). The task graph is separately accepted under IP26. |
| [Quality Requirements](quality-requirements.md) | Accepted by the requester under [NF12](../../authoring_progress.md#quality-requirements-decisions). |
| [Unit of Work Review](unit-of-work-review.md) | Accepted by the requester under [UR16](../../authoring_progress.md#unit-of-work-review-decisions). |

## Agreed boundaries

Project preparation belongs to the Initialization phase.

Functional Design states domain behavior, the domain model, and functional contracts in `design.md`.

Quality Requirements states quality targets and constraints in `.kepler/missions/<mission-id>/construction/units-of-work/<unit-id>/quality.md`. This document is required for that stage. Applicable requirements include performance, availability, security, accessibility, compatibility, operability, observability, and maintainability.

Implementation Planning selects the technical solution against the functional design and quality requirements. It then divides the work into implementation tasks. It writes `plan.md` with technical rationale and `tasks-dag.json` with the task graph at the unit root. The [accepted stage contract](implementation-planning.md) states the artifact split. Use the [accepted task graph specification](task-graph.md) with UUIDv4 task IDs.

Code Generation runs typechecking, tests related to its modifications, and author self-review. Code Validation runs typechecking, the project build, and the full application test suite. A non-author reviewer supplies independent feedback without editing the candidate. Code Integration runs the same three checks against the combined candidate under the unit lock.

For each task, Implementation runs Code Generation, Code Validation, then Code Integration. Their [compact Activity contracts](activities/README.md) keep shared rules separate from Activity-specific responsibilities. Standard routes the completed integrated result to Unit of Work Review.

## Implementation

The [accepted unit-stage contract](implementation.md) states the Implementation contract. Dedicated [Generation](activities/code-generation.md), [Validation](activities/code-validation.md), and [Integration](activities/code-integration.md) contracts state their accepted Activity responsibilities and procedures.

Implementation is a unit-scoped stage. The orchestrator executes the task graph and coordinates task implementation, integration, and completion.

Start tasks when their required predecessor outputs are available in the unit's integrated state. Independent, ready task loops run concurrently. Follow the shared [task admission and baseline rules](../../runtime.md#task-admission-and-baselines).

This diagram is illustrative. Task K represents one task, not a required task identifier format. Activities are steps inside the task's Implementation scope.

```text
Implementation
  Task K
    Code Generation -> Code Validation -> Code Integration
    Correction: authorized return to Code Generation, then repeat required Activities
    Exit: accepted integration and task contract are complete
```

This nested execution structure belongs to Construction. Do not infer the same relationship for other phases or stages.

### Task coding

Task implementation and Task coding are execution contexts, not additional stages or Activities. They add no task-coding attempt identity. The task keeps its identity through the fixed Activity sequence.

Code Generation, Code Validation, and Code Integration are task-scoped Activities. Each Activity occurrence can have several attempts within the same active Implementation attempt.

Code Validation succeeds only when its required checks and independent non-author feedback are complete and no blocking findings are open. This makes the task eligible for Code Integration. It does not complete the task or Implementation.

Internal corrections within an Activity stay in its attempt. An authorized return creates a new Activity attempt when that Activity executes again. Follow the shared [Activity attempt rules](../../runtime.md#activity-attempts).

### Code Integration

Code Integration is a task-scoped Activity after successful Code Validation. Prepare the combined candidate, run the required checks, then accept it as the unit's integrated state.

The [dedicated Activity contract](activities/code-integration.md) states Integration's procedures, evidence, completion conditions, and coordination handoff.

Separate worker results do not show that the combined result is correct. Keep the candidate that passed the checks, the integrated checkpoint, and supporting evidence under the shared [integration and verification rules](../../runtime.md#integration-and-verification).

#### Integration order and locking

Use one integration lock per unit. All task integrations targeting that unit's integrated state must use the same lock. Other operations that change its integrated state must also respect that lock.

1. **Acquire the lock.** Wait for the unit's integration lock. Do not read the current integrated checkpoint before acquiring the lock.
2. **Prepare the candidate.** Read the current repository-qualified unit checkpoint set after acquiring the lock. Combine it with validated task outputs. Record actual Integration inputs separately from each task's fixed admission baseline.
3. **Run the required checks.** Run typechecking, the project build, and the full application test suite against that candidate. All three must complete successfully. Bind the results to the material that passed the checks and actual inputs.
4. **Accept the candidate.** Use authorized orchestrator and CLI operations to accept only a candidate set that passed the required checks. Record each necessary repository result. If any bytes change, run the required checks against the changed candidate before acceptance.
5. **Release the lock.** Release it when the Integration operation ends. Do not keep it during a return to Code Generation.

Hold the lock through preparation, checks, and acceptance across the selected repositories. Integration checks for the same unit are therefore serialized. Repository commits do not form an atomic cross-repository commit. This replaces the earlier restriction to short integration updates.

Candidate acceptance means updating the unit's integrated state. It is not requester approval.

The orchestrator records task completion only after successful acceptance and satisfaction of the task's completion conditions. Dependent tasks can then use that integrated output under the accepted dependency graph and admission rules.

Do not use this lock as a task admission gate. The agreed rules keep parallel execution for Code Generation, Code Validation, and Activities in other units. Independent tasks continue while their inputs and contracts are valid.

Lock ownership does not introduce another attempt identity or run floor. Apply the accepted [shared lock and ownership rules](../../runtime.md#short-scoped-coordination) and [Mission coordination paths](../../mission.md#local-storage-and-concurrency).

### Return paths

Code Integration workers report findings and proposed correction boundaries. The orchestrator authorizes returns under the shared [revision authority rules](../../revision.md#authority-and-escalation).

| Finding | Route |
| --- | --- |
| Integration cannot accept the task implementation output without a change. | The orchestrator authorizes a return to Code Generation. Execute Code Generation, Code Validation, and Code Integration again. |
| A retry is necessary for an Integration-only operation. | Continue within the current Code Integration attempt. A failed command alone does not create another attempt. |
| A finding invalidates an upstream contract. | The orchestrator selects the affected scope and earliest stage, then applies the shared revision procedure. |

A task-local return does not itself start another Implementation attempt. Independent task loops continue while their inputs and contracts are valid.

### Unit-wide upstream revision

When the orchestrator authorizes a unit-wide revision from Implementation Planning or an earlier stage, stop the unit's implementation work.

1. **Stop task work.** Stop new task admissions and all active task execution for that unit. This includes Code Integration.
2. **End the attempts.** End any active Implementation attempt and all active Activity attempts for that unit. Keep existing work and evidence as history. Do not pause these attempts for later continuation. Ended attempts must not complete tasks or accept integration candidates.
3. **Execute the revised stages.** Follow the shared [Revision procedure](../../revision.md#revision-procedure). Restart Implementation only after the revised upstream stages complete. Start new Implementation and Activity attempts when their stage or Activity executes again.

Independent units continue while their inputs and contracts are valid. Task-local corrections keep the [existing return paths](#return-paths). They do not trigger this unit-wide stopping procedure.

### Attempts and completion

Implementation has a unit-scoped attempt. Within that attempt, the task and Activity definition identify one fixed Activity occurrence. Each occurrence can have several Activity attempts, but only one can be active. Several Activity attempts can belong to the same active Implementation attempt.

Use each Activity attempt's identity as its [run floor](../../runtime.md#run-floor). Task implementation and Task coding do not add another attempt identity or run floor.

Complete Implementation when required task implementations are complete and the integrated unit result satisfies its required checks. The result is then ready for Unit of Work Review, not automatically approved for delivery.

Tasks are accepted through successful Code Validation and Code Integration, not routine requester approval. Ask the requester only about [hard blockers](implementation.md#requester-intervention) that only they can resolve. Continue independent ready work while affected work waits.

### Remaining implementation work

The requester accepted [Planning](implementation-planning.md), [Implementation](implementation.md), [Unit of Work Review](unit-of-work-review.md), and [Deliver](deliver.md). Their contracts state required evidence, completion, role and skill responsibilities, reopening questions, and handoffs. The task graph writer and validator are still implementation work.

Typechecking, the project build, and the full application test suite are required integration checks. Additional applicable obligations still apply. General extra-check policy stays deferred under DF13. Under accepted [DF14](../../authoring_progress.md#completed-construction-decisions), use repository-native scripts or task targets and explicit repository-qualified commands in existing planning material. Missing commands block affected checks. Candidate checks precede acceptance under the agreed integration procedure.

SH64-SH66 settle the lock mechanism, owner-record facts, and cross-workspace coordination. Exact key encodings, record fields, and finer release protocols remain implementation choices. SH67 accepts manual unlock as a recovery policy. Follow the shared [coordination rules](../../runtime.md#short-scoped-coordination), [Mission paths](../../mission.md#local-storage-and-concurrency), and [interrupted-work recovery rules](../../runtime.md#interrupted-work-recovery).

[DF15](runtime.md#accepted-task-transition-rules), [DF16](runtime.md#dependency-invalidation), and [DF17](runtime.md#revision-shutdown-coordination) accept task-transition, dependency-invalidation, and revision-shutdown rules. Implementation must satisfy these rules. They add no requester approval gate. Interrupted event-write recovery follows [SH87](../../runtime.md#interrupted-event-write-recovery).

## Specification use

Read the accepted contract before deriving its supporting skills or CLI features. Specification approval does not authorize a specific unit's implementation or delivery, or change existing runtime behavior.
