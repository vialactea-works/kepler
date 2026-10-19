# Unit of Work

[Workflow phase index](README.md)

**Status:** Draft for discussion.

## Definition

A Unit of Work groups work around a coherent intended outcome. The requester can compare the outcome with the acceptance conditions before accepting the Unit of Work as a whole. Acceptance cohesion is its primary boundary. The [Mission contract](mission.md) sets its record home and mission membership.

Construction operates on one Unit of Work. A unit can contain several requirements and implementation tasks. It is not automatically a DDD bounded context or an aggregate.

## Rules

### Identity and directory

- The CLI creates the unit ID in the format `YYYY-MM-DD-<slug>`.
- The date is the date when the CLI creates the unit, in the machine's local timezone. It is not the date when implementation starts.
- The slug describes the unit with lowercase words separated by hyphens.
- The complete ID must be unique within the record-home project, including known unbound units. Cross-project uniqueness is not necessary.
- Use the exact ID as the directory name under its mission: `.kepler/missions/<mission-id>/construction/units-of-work/<unit-id>/`.
- Keep the complete ID and directory name unchanged across stages, revisions, retries, branches, and worktrees. Do not update the date or slug when the description or machine timezone changes.
- Every unit-owned artifact records this ID in `unit_id`. Each artifact keeps its separate UUID in `id`.

#### Example

This path is illustrative. Paths are relative to the selected record-home working-tree root:

```text
.kepler/missions/<mission-id>/construction/units-of-work/2026-10-17-order-cancellation/
```

### Acceptance cohesion

Group work by the outcome to be accepted. Use the outcome to select which work belongs together.

### Coverage

Assign every agreed requirement in the decomposition's scope to at least one Unit of Work. Each unit must contribute an identifiable outcome. Identify missing coverage before you accept the decomposition.

### Dependencies

Record what each unit must get from other units and the relevant interaction contracts. Use these dependencies when you set practical boundaries.

### Verification

Give meaningful acceptance conditions for each unit based on its dependencies. The conditions must show an outcome, not only a set of completed tasks.

### Deployment

Include deployment in the Unit of Work definition. The accepted [Deliver contract](phases/construction/deliver.md#deployment-information) gives deployment information, unit-root `delivery.md` instructions, and stage-specific timing under [SH77 through SH79](authoring_progress.md#completed-shared-decisions).

Record known deployment constraints. Keep technical solution selection in Implementation Planning.

## Walking skeleton

A walking skeleton is a specialized kind of Unit of Work. It shows a minimal path through the important solution boundaries. That path is executable, deployable, and observable.

Its acceptance cohesion comes from proof of that integrated path. Completion of the broader product feature is not necessary for acceptance.

### Origins

| Situation | Treatment |
| --- | --- |
| Inception | Use a walking skeleton when decomposition makes early proof of the integrated solution necessary. |
| Greenfield work | Recommend a walking skeleton as the first unit. Subsequent units extend it. |
| Direct requester proposal | Suggest a preceding walking skeleton unit when the proposed work depends on significant, unproven integration or deployment assumptions. |

The requester must accept an additional preceding unit and its scope. Record the dependency. Do not silently replace or postpone the original request.

### Rules

- Use the normal Unit of Work documents, Construction stages, and approval rules.
- Give the path, boundaries, deployment target, and evidence necessary for acceptance.
- Keep functional scope narrow and include the important integrations.
- Keep the implementation for subsequent units to extend.
- Select technical mechanisms during Implementation Planning, not during Inception.
- Do not add a separate skeleton when the originally proposed unit already gives a suitable thin integrated outcome.

### Metadata

Record the canonical `walking-skeleton` label in `labels` on the unit's `unit-of-work.md`. Its artifact `type` stays `unit-of-work`. Use the shared [labels contract](metadata.md#labels), not a separate `unit_kind` field.

Artifacts can use canonical labels or labels selected by the requester. They must not record execution state. Dynamic state follows the [CLI infrastructure contract](runtime.md).

## Decomposition procedure

1. Identify the intended outcomes and known requirements.
2. Group work by acceptance cohesion.
3. Compare known requirements with planned unit outcomes, then identify possible splits.
4. Record dependencies and interaction boundaries.
5. Make sure that each unit has a verifiable outcome.
6. Agree the boundaries with the requester.

## Decisions still required

- Additional scope and size criteria, and the detailed decomposition questionnaire, stay unresolved beyond the MVP under [SH75/SH76](authoring_progress.md#deferred-decisions).

Use the accepted cohesion, coverage, dependency, verification, and decomposition rules for the Construction MVP. This does not select additional criteria or a questionnaire contract.

The [authoring progress record](authoring_progress.md#mvp-decisions) lists these decisions. Artifact metadata details that stay open are shared decisions. The [CLI infrastructure contract](runtime.md) sets the separation between artifact metadata and execution state.

## Inspiration

The AWS AI-DLC Units Generation reference informs the coverage, dependency, and verification discussion. Its artifact set, deployment conventions, and approval gates do not automatically apply to Kepler.

Source: `https://github.com/awslabs/aidlc-workflows/blob/main/docs/reference/04-stages/inception.md#stage-27-units-generation`.
