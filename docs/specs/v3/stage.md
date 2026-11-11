# Stage contract

[Workflow phase index](README.md) | [Construction phase](phases/construction/README.md) | [Standard workflow](workflows/standard/README.md)

**Status:** Accepted by the requester under [SH126](authoring_progress.md#completed-shared-decisions).

## Purpose

A **stage** is a bounded workflow responsibility owned by a phase. Its contract states four characteristics: Inputs, Lead agent, Outputs, and Gates. The owning phase sets the stage's responsibility, scope, and detailed contract. A workflow selects phase-owned stages and sets their order and routing. It does not replace their contracts.

## Characteristics

### Inputs

List the material the stage needs. Name applicable outputs from earlier stages, current authored artifacts, execution records, requester instructions, project context, and existing system material. Mark optional inputs. State which inputs must be available before the stage starts.

The first stage in a workflow can use the request and available context as its inputs. It does not need outputs from a stage that has not run. Functional Design is first in Standard. Its request, unit context, and available project information are its bootstrap inputs. Inception outputs are optional. Functional Design does not require completed documents or its own outputs before entry. Initialization and Inception have no stage contracts in the current reference; this definition does not add stages to them.

### Lead agent

Name the stage's existing accountable owner. The lead is responsible for the work and handoff set by the stage contract. The lead is not necessarily the only worker. This characteristic does not assign a worker, select a model or topology, add an agent profile, or define authentication.

The lead does not gain authority that another contract assigns to the requester, orchestrator, or operation authority. Keep existing review triggers, approval rules, and permissions.

### Outputs

Name the stage's required outputs and identify their kind:

- **Authored artifacts** state requirements, designs, plans, or instructions.
- **Executable or integrated material** contains implementation or another stage's resulting work.
- **CLI-owned records and evidence** state execution facts, checks, reviews, approvals, or operation results under existing contracts.
- **Handoffs** identify the result, inputs, evidence, limitations, and next responsibility.

A stage can use only the kinds that apply. Mark supporting artifacts and conditional records as optional or conditional. An execution record does not require a separate report file. Do not add universal deployment, release, or publication outputs.

### Gates

State entry and advancement conditions separately. **Entry** conditions determine when a stage can start. **Advancement** conditions determine when the workflow can proceed from that stage. Use the stage's existing scope, current attempt, material, inputs, evidence, and authority rules.

Keep required checks and approvals distinct. A stage adds no approval merely by naming its lead or outputs. File presence, stage metadata, a positive review, a process exit, or a commit alone does not establish completion or grant authority. Keep requester-triggered reviews and conditional approvals under their existing conditions.

## Ownership and status

The phase owns the stage contract, execution scope, evidence, completion, correction, and handoff rules. The workflow composes stage order and routing. A stage contract does not define a shared schema, command, event field, metadata store, registry, or workflow engine.

Each stage's status states whether its contract is accepted. Specification acceptance does not prove implementation or release. Runtime state remains under the owning phase's event and journal rules. Apply shared [Effort](effort.md) and [Revision](revision.md) without changing their authority or scope.

Future stage contracts must use the same four characteristics. The Construction [Activities](activity.md) remain bounded responsibilities inside Implementation, not stages. This contract adds no Activity or changes the accepted six-stage Construction catalog.
