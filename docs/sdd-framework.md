# Standard Construction workflow

Kepler's version 3 workflow gives a Unit of Work durable artifacts, scoped execution history, and explicit stage handoffs. The command-line interface records and guards workflow operations. Portable skills describe stage procedures. A coding-agent host controls dispatch and provides any required concurrency or independent context.

## Standard sequence

A mission contains one Unit of Work and binds it to the `standard` workflow. Standard runs these Construction stages in order:

| Order | Stage | Main output |
| --- | --- | --- |
| 1 | Functional Design | Unit definition, design, and required requester approval. |
| 2 | Quality Requirements | Applicable quality targets, constraints, and required approval. |
| 3 | Implementation Planning | Technical rationale, `plan.md`, and `tasks-dag.json`. |
| 4 | Implementation | Task outputs integrated into the unit under required checks and evidence. |
| 5 | Unit of Work Review | Independent assessment of the complete integrated outcome. |
| 6 | Deliver | The authorized delivery outcome, verification, limits, and handoff. |

A stage advances only when its own inputs, evidence, approvals, and completion conditions hold. A successful CLI operation does not mean the whole workflow is complete.

## Entry and project scope

A clear request can enter Construction directly. Existing application code, tests, and completed Initialization or Inception phases are not prerequisites. Greenfield work is supported when the selected record-home and workspaces satisfy the CLI's project and mission requirements. Mission creation prepares only the requested workspaces and does not start a stage. Continue interrupted startup with `kepler mission prepare --mission <mission-id> [--project <record-home>]`; do not allocate another mission as a retry. Recorded preparation is historical evidence, not current workspace readiness.

Project-scoped commands select the current Git working-tree root by default or an explicit root with `--project`. The selected record-home must satisfy the v3 `.kepler/` and Git requirements. Do not use a nested directory as the project root or assume that mission creation migrates older records. See the [CLI guide](cli.md) and [mission contract](specs/v3/mission.md).

## Implementation Activities

Implementation owns task execution. Its task graph records dependencies, prerequisite conditions, acceptance, output expectations, and planned verification. The orchestrator reads readiness and admits eligible tasks against fixed repository-qualified baselines. Readiness alone does not authorize edits.

Each task proceeds through three Activities:

1. **Code Generation:** the assigned coder implements the task and records output and checks.
2. **Code Validation:** a separate non-author reviewer checks the task output and records independent feedback.
3. **Code Integration:** the orchestrator locks the unit, prepares the combined candidate, runs planned checks in each required repository, and accepts only the checked candidate.

The orchestrator may dispatch independent ready tasks concurrently when the host supports the required separation and control. Kepler's CLI does not schedule workers or provide distributed locking. Integration serializes acceptance within a unit; independent units may proceed when their inputs and resources remain separate.

## Revision and recovery

Keep attempt history. A failed command or lost session does not create a new attempt or prove that a worker stopped. Before resuming, inspect the exact unit, stage, task, Activity, input checkpoints, evidence, and any Integration lock. Preserve partial writes and uncertain effects. Resume the same paused attempt only when its inputs and ownership remain valid.

When an upstream change invalidates downstream work, the authorized orchestrator records a scoped revision through the CLI. Stop affected work, reconcile running workers and locks, and reopen only the affected stages or Activities. Do not edit journals or projections directly, force an acceptance, or infer a safe retry from timestamps. See [recovery guidance](recovery.md) and the [revision contract](specs/v3/revision.md).

## Review and delivery authority

Unit of Work Review evaluates the full integrated outcome, not only changed lines. Deliver then verifies the agreed outcome and performs only operations covered by explicit requester or operator authority. Workflow completion does not grant permission to publish a release, deploy, push, merge, roll back, or delete data.

## Version boundaries

The current phase CLI implements Construction. Initialization and Inception remain future work. `kepler workbench` serves the earlier change-based workflow and its artifact model. Kepler does not convert earlier artifacts or history into v3 records, and setup does not restore active workers or locks. Keep active work with the generation that created it.

The [v3 specification index](specs/v3/README.md) links detailed contracts and deferred decisions. Specifications define intended contracts; use executable CLI behavior and release evidence to establish what a particular release supports. Kepler's E2E coverage verifies executable CLI workflows and filesystem/Git/history effects. It does not certify a host or agent's behavior.
