# Support operations

[Reference index](README.md) | Previous: [Artifacts](artifacts.md) | Next: [Reference maintenance](maintenance.md)

Support operations prepare decisions or coordinate core work. They do not add core step numbers or bypass core gates.

## Wayfinder

The [inception phase](../phase_inception/README.md) owns the complete Wayfinder definition. It covers charting, ticket authorization, investigations, language, route closure, and recovery.

Construction consumes a compiled route through the [phase handoff](../phase_inception/handoff.md). A route unit supplies an outcome and constraints, not formal approval or an implementation task.

| Boundary | Input → output | Construction obligation |
| --- | --- | --- |
| Start a unit | Exact eligible route unit and authorized owner → matching change scaffold and in-progress claim. | Apply [G25](gates.md#g25-route-binding). Preserve source/target and dependency evidence. |
| Execute a change | Bound outcome and constraints → independently gated implementation. | Apply construction intent, planning, task, and branch-review gates. |
| Complete a unit | Observed qualifying finish effect → named unit shipment and final map update when applicable. | Apply [G30](gates.md#g30-strategy-and-shipment). Preserve sibling state and verify delivery before status updates. |

The former local V0–V4 states now correspond to W0, W1, W3, W4, and W5 in the [inception lifecycle](../phase_inception/lifecycle.md).

The former V01–V04 transitions now correspond to WX01, WX05, WX06, and WX07. V05 and V06 map to WT05 and WT08 in the [ticket cycle](../phase_inception/ticket-cycle.md).

The former V07 supersession operation belongs to WT09. Inception's WG gate tables replace the former local support gate table.

Research, prototype, grilling, and domain modeling can also support construction. Their [inception operation contracts](../phase_inception/investigations.md) and [language contract](../phase_inception/domain-modeling.md) retain their safety boundaries.

## Critique

Critique checks proposal, requirements, and design against each other and the repository. The reviewer writes findings, not fixes to the input artifacts.

| State | Responsibility | Inputs → outputs | Contract |
| --- | --- | --- | --- |
| Q0 · Critique requested | Establish the artifact scope. | Present formal artifacts, specs, glossary, and source → review scope. | Absent optional artifacts do not justify invented content. |
| Q1 · Findings prepared | Verify claims and classify located findings. | Read-only inspection → numbered findings and quality assessment. | Proposed code needs clear ownership. Existing-code claims need actual source proof. |
| Q2 · Disposition unresolved | Record the critique without inventing a user decision. | Report → `critique.md` with verdict and decision. | A skipped decision supplies no clearance. |
| Q3 · Disposition settled | Apply the supported owner decision. | Explicit decision and any applied corrections → settled critique. | Formal intent approval remains separate. |

| ID | From → to | Actor and operation | Input → output | Conditions and contract |
| --- | --- | --- | --- | --- |
| Q01 | Q0 → Q1 | Critique reviewer inspects artifacts. | Scoped inputs → located findings. | Verify logic, language, boundaries, source references, and structural quality. |
| Q02 | Q1 → Q2 | Critique reviewer records the report. | Validated findings or disclosed unattended findings → lint-valid critique. | Preserve the review-only boundary. Do not invent acceptance. |
| Q03 | Q2 → Q3 | Requester settles disposition. | Explicit decision and application evidence → settlement. | Apply [G06](gates.md#g06-critique-disposition). Return revisions to the intent owner. |

A settled critique can return to plan, code, or orchestration as applicable. It cannot waive exact requester approval of formal inputs.

## Orchestration

The coordinator operates across steps 3, 4, and 5. It hands current branch clearance to step 6.

Its input is the committed plan, ledger, task history, feedback, review, standards, and current Git evidence.

Its output is fully gated active tasks and durable current branch clearance. A blocker instead returns control to the responsible owner.

| State | Responsibility and evidence | Contract |
| --- | --- | --- |
| O0 · State loaded | Validate artifacts and derive current task readiness. | Conversation memory and todo status are not durable authority. |
| O1 · Lanes active | Admit compatible workers and inspect returned evidence. | Workers remain isolated. Only the coordinator mutates shared runtime state. |
| O2 · Task gates checked | Integrate, Verify, publish, and obtain independent feedback. | Root done cannot replace task clearance. |
| O3 · Branch gate checked | Obtain and validate the root review commit. | Every active task is fully gated first. |
| O4 · Finish handoff ready | Supply clean, current clearance to the finish owner. | The coordinator does not merge or create requests. |

| ID | From → to | Actor and operation | Input → output | Conditions and contract |
| --- | --- | --- | --- | --- |
| O01 | O0 → O1 | Coordinator selects and admits ready tasks. | Current graph and identities → isolated admitted lanes. | Apply [G08](gates.md#g08-input-standing), [G09](gates.md#g09-admission), and [G11](gates.md#g11-dispatch-identity). |
| O02 | O1 → O2 | Coordinator publishes and checks feedback. | Original worker outcomes → current task clearance or held findings. | Apply [G13](gates.md#g13-publication) through [G18](gates.md#g18-finding-routes). |
| O03 | O2 → O0 | Coordinator recalculates remaining work. | Changed task or feedback evidence → updated readiness. | Do not infer execution order from task numbers. |
| O04 | O2 → O3 | Coordinator obtains branch review. | All tasks fully gated → root review commit. | Apply [G19](gates.md#g19-branch-range) and [G20](gates.md#g20-branch-clearance). |
| O05 | O3 → O4 | Coordinator supplies the finish handoff. | Current approval and clean workspace → finish inputs. | The finish owner independently applies [G21](gates.md#g21-finish-admission). |
| O06 | O3 → O0 | Coordinator routes branch findings. | Complete classified blocker set → updated owner work. | Apply [G18](gates.md#g18-finding-routes). Never implement corrections in the controller. |

The todo list mirrors durable state. It does not approve a task, reserve a prerequisite, or publish a result.

## Other support skills

| Operation | Responsibility | Inputs → outputs and artifacts | Contract |
| --- | --- | --- | --- |
| Research | Answer a bounded external question from high-trust sources. | Question and destination path → sourced Markdown findings, often under `<effort>/research/`. | Distinguish findings from assumptions. Research cannot approve intent or resolve unrelated tickets. |
| Prototype | Test a design question with disposable code. | Specific question and branch context → throwaway artifact and observed conclusion. | Run the prototype branch gate before code. Do not treat the result as production implementation. |
| Grilling | Resolve user-owned ambiguity through dialogue. | Question, plan, or finding set → explicit decisions and unresolved questions. | The exit condition determines completion. Dialogue cannot fabricate requester approval. |
| Domain modeling | Maintain scoped language and explicit model decisions. | Project evidence and requester decisions → glossary or model updates. | Confirm material changes to canonical meanings. Keep unresolved meanings explicit. |
| Compose-spec | Author canonical capability documents outside the change pipeline. | Direct specification authority and source behavior → canonical `.kepler/specs/` files. | Do not infer authority to change a contract from source code alone. |

These operations do not add numbered construction steps. Their durable handoffs use the relevant inception or construction artifact contracts.
