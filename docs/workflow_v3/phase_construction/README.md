# Construction phase: SDD framework

[Workflow phase index](../README.md)

## Purpose

Construction operates on one Unit of Work. Its stages define responsibilities independently of the skills and agents that support them.

This reference is under development. The stage outline records the current proposal. Only Functional Design has a contract draft. That draft still requires discussion and revision.

## Stage outline

| Order | Stage | Contract status |
| --- | --- | --- |
| 1 | [Functional Design](functional-design.md) | Draft for discussion. |
| 2 | Non-functional Requirements | Name agreed. Contract not yet defined. |
| 3 | Implementation Planning | Name agreed. Contract not yet defined. |
| 4 | Code Generation | Contract not yet defined. |
| 5 | Code Validation | Contract not yet defined. |
| 6 | Unit of Work Review | Contract not yet defined. |
| 7 | Deliver | Contract not yet defined. |

## Agreed boundaries

Project preparation belongs to the Initialization phase.

Functional Design defines domain behavior, the domain model, and functional contracts in `design.md`.

Non-functional Requirements defines quality targets and constraints in `.kepler/units-of-work/<unit-id>/quality.md`. This document is required for that stage. Applicable requirements include performance, availability, security, accessibility, compatibility, operability, and observability.

Implementation Planning selects the technical solution against the functional design and non-functional requirements before it divides the work into implementation tasks. The location of its technical design record requires a separate decision.

Code Generation runs tests related to its modifications. Code Validation runs the complete application test suite and owns independent code feedback.

Code Generation and Code Validation form an inner correction loop. Unit of Work Review examines the complete result after that loop.

## Draft use

Read the stage contract before proposing changes to its supporting skills or CLI features. A saved draft does not authorize implementation, delivery, or changes to existing runtime gates.
