# Unit of Work

[Workflow phase index](README.md)

**Status:** Draft for discussion.

## Definition

A Unit of Work groups work around a coherent intended outcome that the requester can evaluate and accept as a whole. Acceptance cohesion is its primary boundary.

Construction operates on one Unit of Work. A unit can contain several requirements and implementation tasks. It does not automatically define a DDD bounded context or an aggregate.

## Rules

### Identity and directory

- The CLI creates the unit ID in the format `YYYY-MM-DD-<slug>`.
- The date is the date when the CLI creates the unit, in the machine's local timezone. It is not the date when implementation starts.
- The slug describes the unit with lowercase words separated by hyphens.
- The complete ID must be unique within the project. Cross-project uniqueness is not required.
- Use the exact ID as the directory name: `.kepler/units-of-work/<unit-id>/`.
- Keep the complete ID and directory name unchanged across stages, revisions, retries, branches, and worktrees. Do not update the date or slug when the description or machine timezone changes.
- Every unit-owned artifact records this ID in `unit_id`. Each artifact keeps its separate UUID in `id`.

#### Example

This path is illustrative:

```text
.kepler/units-of-work/2026-10-17-order-cancellation/
```

### Acceptance cohesion

Group work by the outcome to be accepted. Use that outcome to assess whether the included work belongs together.

### Coverage

Assign every agreed requirement in the decomposition's scope to at least one Unit of Work. Each unit must contribute an identifiable outcome. Identify missing coverage before accepting the decomposition.

### Dependencies

Record what each unit needs from other units and the relevant interaction contracts. Use these dependencies when assessing whether the proposed boundaries are practical.

### Verification

Define meaningful acceptance conditions for each unit, considering its dependencies. The result must be verifiable as an outcome, not only as a set of completed tasks.

### Deployment

Include the deployment aspect in the Unit of Work definition. Its detailed content and artifact location require a separate decision.

Record known deployment constraints without moving technical solution selection out of Implementation Planning.

## Walking skeleton

A walking skeleton is a specialized kind of Unit of Work. It establishes a minimal executable, deployable, and observable path through the important boundaries of a solution.

Its acceptance cohesion comes from proving that integrated path. It does not need to complete the broader product feature.

### Origins

| Situation | Treatment |
| --- | --- |
| Inception | Produce a walking skeleton unit when decomposition identifies a need to prove the integrated solution early. |
| Greenfield work | Recommend a walking skeleton as the first unit. Subsequent units extend it. |
| Direct requester proposal | Suggest a preceding walking skeleton unit when the proposed work depends on significant, unproven integration or deployment assumptions. |

The requester must accept an additional preceding unit and its scope. Record the dependency. Do not silently replace or postpone the original request.

### Rules

- Use the normal Unit of Work documents, Construction stages, and approval rules.
- Define the path, boundaries, deployment target, and evidence needed for acceptance.
- Keep functional scope narrow while exercising the important integrations.
- Preserve the implementation for subsequent units to extend.
- Select technical mechanisms during Implementation Planning, not during Inception.
- Do not add a separate skeleton when the originally proposed unit already provides a suitable thin integrated outcome.

### Metadata

Record Walking skeleton as the unit's kind in mostly immutable artifact frontmatter. The exact field and format remain part of the shared [Artifact metadata contract](metadata.md). Unit kind does not describe execution progress. Dynamic state follows the [CLI infrastructure contract](runtime.md).

## Decomposition procedure

1. Identify the intended outcomes and known requirements.
2. Group work by acceptance cohesion.
3. Check coverage and identify candidate splits.
4. Record dependencies and interaction boundaries.
5. Confirm that each unit has a verifiable outcome.
6. Agree the boundaries with the requester.

## Decisions still required

- Detailed scope and size criteria, and the decomposition questionnaire.
- Deployment information to record, its location, and when it must be defined.

The [authoring progress record](authoring_progress.md#shared-decisions-still-pending) tracks these decisions. Remaining artifact metadata details are shared decisions. The [CLI infrastructure contract](runtime.md) defines the separation between artifact metadata and execution state.

## Inspiration

The [AWS AI-DLC Units Generation reference](https://github.com/awslabs/aidlc-workflows/blob/main/docs/reference/04-stages/inception.md#stage-27-units-generation) informs the coverage, dependency, and verification discussion. Its artifact set, deployment conventions, and approval gates do not automatically apply to Kepler.
