# Reference maintenance

[Reference index](README.md) | Previous: [Support operations](support.md)

## Authority and change order

This folder is the canonical workflow definition. Skills, CLI mechanics, templates, and explanatory documents implement or explain this definition.

A runtime mismatch does not authorize a gate bypass. Record and correct the mismatch through an explicit change.

This reference formalizes existing responsibilities and internal states. State and transition IDs are document identifiers, not new persisted fields.

A new state name alone does not require a CLI enum, database, or workflow engine.

### Document-first procedure

1. Identify the affected step, state, transition, gate, and artifact owner.
2. Change their canonical contracts in this folder first.
3. Update the diagrams and transition tables together.
4. Present any changed behavior or authority to the requester for approval.
5. Identify affected skills, CLI operations, templates, tests, and explanatory documents.
6. Implement the approved definition in those surfaces.
7. Verify positive, failure, retry, and recovery paths at the affected boundaries.
8. Check the final implementation against the approved document revision.

A document-only proposal must identify any deliberate implementation gap. It must not claim that the CLI already supports the proposed behavior.

An accepted workflow change must update this folder before its implementation. An implementation difference must not silently redefine the canonical contract.

## Reference structure

| Information | Canonical location | Change rule |
| --- | --- | --- |
| Terms and common recovery | [Concepts](concepts.md) | Define a term before first use in a detailed contract. |
| Core step count and boundaries | [Workflow map](lifecycle.md) | Keep seven steps with stable numbers. |
| Preparation states and operations | [Preparation](preparation.md) | Preserve project, intent, and planning ownership. |
| Task implementation and feedback | [Task cycle](task-cycle.md) | Keep admission, publication, and clearance distinct. |
| Complete-change review | [Branch review](branch-review.md) | Preserve full versus remediation coverage rules. |
| Finish and repair | [Finish](finish.md) | Preserve intent-before-effect and observation-before-outcome ordering. |
| Transition conditions | [Gates](gates.md) | Keep conditions in tables, outside diagrams. |
| Durable records and CLI roles | [Artifacts](artifacts.md) | Identify each permitted writer and consumer. |
| Optional operations | [Support operations](support.md) | Do not add optional operations to the core step count. |

Use a stable identifier for each state, transition, and gate. If you remove an identifier, record its replacement in the relevant change.

Keep diagrams small. A diagram shows operation names and state names. A table supplies the conditions, owner, inputs, outputs, and contract.

## Initial source map

The initial baseline is working branch `refact/improve-v2`, based on commit `c245895c72f7e648275f9f25c64f9d01d12d39c8`.

The initial reference also includes the working changes to admission, publication, task input, and task review coverage. It is not a released-generation claim.

These links locate the implementation evidence. The linked files do not become a second definition of workflow meaning.

| Contract area | Skill evidence | Template and CLI evidence |
| --- | --- | --- |
| Project readiness | [Init](../../skills/kepler-init/SKILL.md) | [Glossary template](../../bundle/templates/glossary.md), [project path migration](../../packages/cli/src/workbench/project-data-path.ts) |
| Formal intent | [Propose](../../skills/kepler-propose/SKILL.md) | [Proposal](../../bundle/templates/proposal.md), [requirements](../../bundle/templates/requirements-change.md), [design](../../bundle/templates/design.md), [input checks](../../packages/cli/src/workbench/precondition-artifacts.ts) |
| Planning and amendments | [Plan](../../skills/kepler-plan/SKILL.md) | [Plan template](../../bundle/templates/plan.md), [plan history](../../packages/cli/src/workbench/plan-history.ts) |
| Task implementation | [Code](../../skills/kepler-code/SKILL.md) | [Task progress](../../bundle/templates/task-progress.md), [task state](../../packages/cli/src/workbench/task-state.ts), [admission](../../packages/cli/src/workbench/task-admission.ts) |
| Dependency clearance | [Orchestrate](../../skills/kepler-orchestrate/SKILL.md) | [Readiness](../../packages/cli/src/workbench/task-readiness.ts), [context](../../packages/cli/src/workbench/context.ts) |
| Publication coverage | [Task feedback](../../skills/kepler-code-feedback/SKILL.md) | [Publication history](../../packages/cli/src/workbench/task-publication-history.ts), [coverage](../../packages/cli/src/workbench/task-review-coverage.ts), [diff](../../packages/cli/src/workbench/diff.ts) |
| Review durability and scope | [Branch review](../../skills/kepler-review/SKILL.md) | [Feedback template](../../bundle/templates/feedback.md), [review template](../../bundle/templates/review.md), [review passes](../../packages/cli/src/workbench/review-passes.ts) |
| Finish admission | [Finish-work preconditions](../../skills/kepler-finish-work/SKILL.md#preconditions) | [Precondition operation](../../packages/cli/src/workbench/precondition.ts), [review gates](../../packages/cli/src/workbench/precondition-reviews.ts) |
| Finish history and repair | [Finish-work recovery](../../skills/kepler-finish-work/SKILL.md#resume-and-recovery) | [Finish template](../../bundle/templates/finish.md), [finish records](../../packages/cli/src/workbench/finish-records.ts), [repair](../../packages/cli/src/workbench/finish-repair.ts) |
| Maps and routes | [Wayfinder](../../skills/kepler-wayfinder/SKILL.md) | [Map](../../bundle/templates/wayfinder/map.md), [ticket](../../bundle/templates/wayfinder/ticket.md), [route](../../bundle/templates/wayfinder/route.md) |
| Critique settlement | [Critique](../../skills/kepler-critique/SKILL.md#handoff) | [Critique template](../../bundle/templates/critique.md), [artifact body](../../packages/cli/src/workbench/artifact-body.ts) |
| Artifact schemas | Applicable step skill | [Artifact types](../../packages/cli/src/workbench/artifact-types.ts), [schemas](../../packages/cli/src/workbench/artifact-schemas.ts) |

## Compatibility

New plans and the current planner/orchestrator use version 2 dependency execution. Version 1 and unversioned serial plans remain historical context for those skills.

The code skill retains historical serial behavior. The CLI can read supported historical artifacts. Readability does not grant current orchestration authority.

Do not migrate an active historical change implicitly. Complete that change with its compatible generation or obtain explicit authority for a separate plan.

Execution, initialization, input-context, admission, publication, and coverage version numbers identify different schemas. Equal numbers do not imply equal contracts.

Preserve unknown historical facts. Do not reconstruct attempt starts, input blobs, approval identities, or delivery provenance from current state.

## Verification alignment

The current source contains a verification-policy difference:

| Source | Current rule | Reference treatment |
| --- | --- | --- |
| Plan skill, TDD task contract | Task Verify uses related tests, type checking, and configured lint. Full-suite tests and builds occur later. | The plan scopes Verify accordingly. |
| Code skill, Process item 7 | The worker also runs full tests and build or type check unless project standards explicitly scope verification. | G12 retains this additional worker requirement. |
| Review skill, Focused verification | The reviewer runs only focused checks for concrete doubts. | Routine full verification does not belong in review. |
| Finish skill, Preconditions | Full tests and build or type check are mandatory. | G21 requires both through the supplied verification command. |

This reference does not grant a new exception to a required worker check. A later policy change must update these contracts together.

The template inventory also retains a historical root-progress writer description. The current dependency contract gives runtime root writes to the coordinator.

The artifact ownership table in this folder states that current contract. Historical serial behavior remains separate.

Some older skill summaries also describe worker-owned root updates without the historical qualification. They do not override the dependency-mode ownership contract.

Changed-resolution checks for a blocked retry remain coordinator policy. The CLI readiness projection alone does not prove that the blocking condition changed.

## Review checklist

1. Check every diagram edge against its transition table.
2. Check every transition's source, destination, actor, input, output, and gate references.
3. Check every state against its evidence and permitted writer.
4. Check each gate against the affected positive and failure cases.
5. Check interruption and partial-effect paths without assuming rollback.
6. Check all relative links and source references.
7. Read the text in the index order to verify gradual introduction.
8. Check technical terms against Concepts and exact stored identifiers.
9. Check STE sentence length, active voice, consistent words, and one topic per paragraph.
10. Record any unverified runtime or language check without claiming certification.
