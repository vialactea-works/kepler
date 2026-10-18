# Construction phase: SDD framework

[Workflow phase index](../README.md) | [Inception phase](../phase_inception/README.md)

## Purpose

This folder defines the construction phase of the canonical Kepler workflow. It describes the required behavior for people, skills, templates, and the CLI.

Change this reference before you change workflow behavior. Then change the affected skills, CLI operations, templates, tests, and other documents.

This reference formalizes the internal states of the seven core steps. It does not add a workflow engine or new artifact fields.

## Reading order

| Order | Document | Question |
| --- | --- | --- |
| 1 | [Concepts](concepts.md) | What do the terms mean? |
| 2 | [Workflow map](lifecycle.md) | How do the seven steps connect? |
| 3 | [Preparation](preparation.md) | How does a project become ready for task work? |
| 4 | [Task cycle](task-cycle.md) | How does one task reach independent approval? |
| 5 | [Branch review](branch-review.md) | How does the complete change receive approval? |
| 6 | [Finish](finish.md) | How does the change finish safely? |
| 7 | [Gates](gates.md) | Which conditions permit each transition? |
| 8 | [Artifacts](artifacts.md) | Which records prove the state, and who can change them? |
| 9 | [Support operations](support.md) | How do optional operations connect to the core steps? |
| 10 | [Reference maintenance](maintenance.md) | How do we change and verify this definition? |

For a first reading, read Concepts and Workflow map. Then read the step that you need.

The diagrams show states and operation names. The transition tables identify the applicable gates. The gate tables contain the conditions.

## Scope

The core steps are `init`, `propose`, `plan`, `code`, `code-feedback`, `review`, and `finish-work`.

Step 0 prepares a project once. Step 1 is optional for a tactical change. Steps 3 and 4 repeat for each task.

The [inception phase](../phase_inception/README.md) defines Wayfinder. Critique and orchestration support the construction steps. These operations do not increase the core step count.

New plans use `execution: {version: 2, mode: dependencies}`. Historical serial plans keep their recorded contracts. They do not become dependency plans automatically.

Unknown execution modes or versions fail closed. They never select a historical fallback.

This reference does not authorize a merge, push, request, installation, or destructive operation. The requester and project rules retain that authority.

## Authority

This reference owns workflow meaning. The [skills reference](../../skills.md) explains skill use. The [SDD framework](../../sdd-framework.md) explains design rationale.

The [artifact contracts](artifacts.md) identify the records that store workflow evidence. Successful artifact lint proves format validity, not approval or permission.

An implementation difference does not change this definition. Record the difference under [Reference maintenance](maintenance.md). Do not bypass a closed runtime gate.

## Writing convention

This reference uses ASD-STE100 Simplified Technical English writing rules. [Concepts](concepts.md) defines the software technical terms.

Commands, paths, field names, and stored values retain their exact spelling. These identifiers are not ordinary English words.

The [ASD-STE100 site](https://www.asd-ste100.org/) provides the language standard. This reference does not claim certified language validation.
