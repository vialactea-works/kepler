# Deliver

[Construction phase index](README.md) | [Workflow phase index](../../README.md)

**Status:** Accepted by the requester under [DL18](../../authoring_progress.md#deliver-decisions).

Deliver is the final agreed Construction stage. The requester accepted this complete contract, including its outcome, artifacts, operations, roles, skills, evidence, and completion conditions. [SH77 through SH79](../../authoring_progress.md#completed-shared-decisions) record the accepted deployment information, its location, and its timing.

This approval concerns the specification. It does not authorize a release, publication, deployment, or other delivery operation.

## Goal

Complete the requested delivery outcome for the reviewed unit, using identified material and authorized operations. Do a check that the actual outcome occurred. Keep sufficient information for the recipient or operator.

Delivery can end with a repository handoff, review request, published release, deployment, or another explicitly agreed outcome. These are examples, not mandatory modes or automatic operations.

## Inputs

- The completed Unit of Work Review handoff and reviewed integrated checkpoint.
- Current unit definition, functional design, quality requirements, plan, task graph, and relevant supporting files.
- Review evidence, known limitations, relevant requester decisions, and applicable acceptance records.
- Requested delivery outcome, recipient or destination, project procedures, and applicable operation authority.
- Relevant artifacts, external prerequisites, target conditions, verification methods, and recovery constraints.
- Earlier delivery operation records and observed effects when resuming interrupted work.

Distinguish reviewed repository material from generated packages, images, external review requests, releases, and running deployments. Identify their relationship before claiming that one represents the other.

## Entry conditions

Start when:

- Unit of Work Review is complete under its applicable contract for the current material.
- The reviewed result and relevant evidence are available.
- The requested delivery outcome is known, or the requester is available to resolve that choice before operations begin.

Drafting instructions and examining target conditions do not themselves authorize delivery side effects. Required permissions and prerequisites apply before their affected operations.

A deployment or publication does not have to succeed before its stage starts.

## Scope

### Included

- Identify the requested outcome, destination, selected material, and required operations.
- Complete authored delivery instructions and make sure that required prerequisites are satisfied.
- Obtain or identify required operation authority without inferring permission from earlier stage completion.
- Do only operations necessary for the authorized outcome.
- Make sure that actual effects meet the delivery acceptance conditions.
- Keep evidence, communicate limitations and recovery information, and complete the recipient handoff.

### Excluded

- Automatically pushing, merging, tagging, publishing, or deploying every completed unit.
- Changing reviewed implementation or upstream obligations without the applicable revision procedure.
- Treating a successful command, created tag, or generated package as proof of an unverified delivery outcome.
- Inventing successful external effects when credentials, permission, environments, or required checks are unavailable.
- Deleting evidence, previous artifacts, or unrelated work as automatic delivery cleanup.

## Artifacts

### Required delivery instructions

The unit root must contain `delivery.md`. Deliver owns this authored document. It describes intended operations and acceptance conditions, not changing execution progress.

Use the existing unit directory and shared metadata contract. Use the accepted `delivery-plan` type. Optional supporting Markdown keeps `type: supporting-document`.

Use `details/deliver/` for useful linked detail. Do not make empty runbooks or separate files necessary merely to fill the stage.

### Required sections

| Section | Required content |
| --- | --- |
| Outcome and destination | State the requested result, recipient or target, selected material, and observable delivery acceptance conditions. |
| Operations and prerequisites | Describe required operations, order, configuration references, external prerequisites, and how the responsible authority will grant permission. |
| Verification and recovery | State checks, expected results, relevant conditions, failure handling, and feasible recovery or compensating actions. |
| Decisions and open questions | Record material decisions, rationale, constraints, known limitations, and unresolved nonblocking matters with their handoff owner. |

Identify configuration and secret references without storing credentials. Explain an inapplicable deployment concern rather than inventing a deployment target or procedure.

Do not store operation status, completed checkboxes, approval flags, current attempts, or actual check results in `delivery.md`. CLI-owned journals keep those facts and derive readable views.

### Deployment information

Required deployment information covers:

- The destination, environment, recipient, and intended externally observable outcome.
- The reviewed source checkpoint and exact deliverable identifiers or the method that will identify them.
- Necessary configuration, data changes, compatibility conditions, dependencies, and operator responsibilities.
- Required operations, their order, applicable permissions, and readiness conditions.
- Verification scope, expected results, environment, and necessary observation after the operation.
- Failure boundaries, recovery or compensation, known irreversible effects, and constraints on safe retries.

Apply this information to the actual requested outcome. A repository handoff does not have to invent production deployment instructions.

When rollback is unavailable, explain the consequence and feasible recovery before the affected operation. Obtain requester decisions where the consequence exceeds existing authority.

Authoritative delivery instructions live in `delivery.md`, with linked supporting detail when useful. Actual operations, approvals, identities, and results are in event-derived execution history.

### Timing and upstream ownership

Record known deployment constraints in the unit definition, as already required. Planning addresses technical dependencies and implementation work that affect delivery feasibility.

Resolve implementation-affecting deployment choices before Planning completes. Whole-unit review examines the resulting preparation and known constraints and states its findings. Completed delivery operations are not necessary for the review.

Complete `delivery.md`, required prerequisites, and applicable permissions before their affected delivery operations. Final instruction completion belongs to Deliver, not an extra earlier stage.

If instructions expose a required implementation, planning, quality, or functional change, report it for upstream revision. Do not repair reviewed implementation through the delivery document.

These timing rules do not add completed Initialization or Inception as prerequisites. Future external availability is not necessary before Planning can complete.

## Delivery procedure

1. **Identify the outcome.** Make sure that the request identifies the destination, recipient, acceptance conditions, reviewed material, and allowed operations.
2. **Prepare instructions.** Complete `delivery.md`, examine relevant target conditions, and identify material prerequisites and recovery constraints.
3. **Do a check of readiness and authority.** Make sure that prerequisites and applicable permissions are in place before each affected operation. Stop only the affected work when a condition is missing.
4. **Do authorized operations.** Execute the required actions against identified material and record actual effects through CLI-owned operations.
5. **Do a check of the outcome.** Make sure that the resulting destination or recipient-facing material matches the requested outcome and retained source bindings.
6. **Hand off and complete.** Supply actual result references, required instructions, limitations, evidence, and remaining recipient responsibilities.

### Material and verification

Use the reviewed checkpoint and identify derived artifacts by immutable references where needed. Do not deliver an unreviewed implementation merely because a branch or tag name stayed unchanged.

A delivery build or package must have a recorded relationship to the reviewed source and relevant configuration. Its successful creation alone does not prove correct publication or deployment.

Verify that the requested effect occurred. For a review request, verify that the target exists and its represented material matches the reviewed material. For publication or deployment, verify the resulting artifact or environment against agreed acceptance conditions.

Retained output, examination of the destination, or application-facing checks may be necessary for verification. Select checks from the outcome and applicable project obligations. Do not invent a universal health-check command.

Respect permissions required for verification operations. A denied or unavailable required check does not become a successful delivery result.

### Failure and interrupted work

Record failed operations and partial effects without claiming completion. Keep the last material that passed the checks, known external state, uncertainty, and required next action.

Before retrying, examine actual effects and make sure that earlier workers or operations are no longer active. Find whether retrying would duplicate publication, deployment, or other side effects.

An operation retry within the active stage keeps its attempt when no authorized reopening occurred. Follow the shared [recovery rule](../../runtime.md#interrupted-work-recovery). A failed command alone does not create another attempt.

Applicable authority is necessary for recovery, rollback, and compensating operations. They are not automatically safe or authorized because the original operation failed.

Do not automatically reverse external effects when an upstream revision starts. Keep facts and state the required recovery separately from the specification cascade.

Independent units continue while their inputs, contracts, and shared-resource conditions are valid. This stage does not introduce a global release or deployment lock.

## Effort

Apply the shared [effort definition](../../effort.md).

| Effort | Deliver guidance |
| --- | --- |
| Minimal | State the outcome, target, material, required operations, verification, recovery, and recipient handoff concisely. |
| Standard | Explain important prerequisites, operational decisions, compatibility concerns, failure handling, and recipient responsibilities. |
| Comprehensive | Analyze complex migrations, target interactions, partial effects, recovery limits, and operational verification in linked detail. |

Effort does not remove required instructions, permissions, checks, retention, or recovery information. It does not turn every unit into a production deployment.

## Agent roles

`kepler-orchestrator` is the accepted stage owner. The role must plan operations, track material, coordinate execution, and do checks. It must compare results with conditions, state the outcome, and prepare the handoff.

Scoped workers can do authorized operations and report actual results. The stage owner is still responsible for readiness, result assessment, evidence, and completion.

The requester keeps authority over the delivery outcome and consequential trade-offs. The orchestrator authorizes revisions under the shared safeguards. Applicable requester instructions and project rules govern operation permissions.

This role assignment does not create an agent profile or select inline work, subagents, or swarms.

## Supporting skills

[kepler-finish-work](../../skills.md#kepler-finish-work) is the accepted entry skill. It prepares instructions, checks readiness, coordinates authorized delivery, verifies results, and supplies the final handoff.

Use [kepler-grilling](../../skills.md#kepler-grilling) for requester-owned choices and [kepler-research](../../skills.md#kepler-research) for uncertain operational facts. Follow the [common skill rules](../../skills.md#common-rules).

Self-review belongs in the entry skill. Its version 3 responsibilities do not adopt current release gates, legacy artifacts, cleanup rules, or implemented commands.

## Review and approval

These stage-specific rules are accepted. They do not grant operation authority.

### Self-review

Review delivery instructions, selected material, destination, prerequisites, permissions, verification, recovery limits, and handoff completeness before operations. Review relevant conditions again when they change.

Do a self-check of the actual results and supporting evidence before reporting completion. Keep intended instructions separate from observed effects.

### Additional review

Additional external review occurs only when the requester asks for it. Existing project-required operation approvals and reviews still apply.

### Operation authority and requester approval

Identify the permission required for each operation and its scope. Earlier design approval, integration acceptance, or positive unit review does not grant that permission.

Use explicit requester instructions or applicable project authority. Resolve missing authority before the affected operation. Do not infer permission from silence, artifact presence, or a passing check.

No automatic final requester approval gate applies. Obtain final approval only when an applicable authority rule or requester instruction makes it necessary.

Record any required requester authorization or acceptance through CLI-owned operations with the relevant attempt and covered material. Keep applicable project authorization references without treating the CLI as the approval authority.

### Reopening questionnaire

1. Is a change to the requested delivery outcome, destination, recipient, or acceptance condition necessary?
2. Does selected material differ from the reviewed implementation or lack required provenance?
3. Does a missing prerequisite, permission, or changed target condition invalidate the delivery procedure?
4. Do actual effects or required verification results invalidate the claimed outcome?
5. Does a failure or partial effect invalidate the planned recovery, retry, or recipient handoff?
6. Is an implementation or upstream contract change necessary rather than a delivery-only correction?

Report findings and the proposed earliest boundary under the shared [revision procedure](../../revision.md#revision-procedure). Answers do not authorize reopening or expand existing authority for external operations.

Local instruction or operation corrections can stay within the active Deliver attempt when upstream contracts stay valid. A new attempt is necessary after authorized reopening when the stage executes again.

## Completion conditions

Complete the stage when:

- The requested delivery outcome, destination, material, and acceptance conditions are explicit.
- `delivery.md` satisfies its accepted content and metadata contract, with relevant linked supporting files.
- Required readiness checks, self-review, and any requested additional review are complete.
- Every required operation has applicable authority and an identified actual result.
- Delivered material has retained provenance to the reviewed result and relevant configuration.
- Required destination or outcome verification succeeds under relevant conditions.
- No blocking failed operation, unknown partial effect, or unmet delivery obligation is unresolved.
- Required approvals or acceptance records bind the material and decisions they cover.
- The recipient handoff identifies the actual result, instructions, limitations, recovery information, and remaining agreed responsibilities.
- Required evidence and material are retained under the shared rules.

A repository handoff can complete without publication or deployment when it is the agreed outcome. An unfinished deployment cannot become complete by silently renaming it a handoff.

### Evidence coverage

| Evidence or approval | Material covered | Required result |
| --- | --- | --- |
| Delivery preparation result | Current `delivery.md`, supporting files, reviewed checkpoint, requested outcome, target, and relevant prerequisites. | Required content, metadata, references, and readiness conditions are valid. Self-review shows that the procedure is feasible and authorized, and states its recovery boundaries. |
| Applicable authorization record | Operation, actor or authority source, destination, selected material, and required permission scope. | The record identifies the source and scope of authorization granted before the affected operation. No permission is inferred from prior stage success. |
| Delivery operation result | Each required operation, its actual inputs, artifact or target identifiers, relevant conditions, and observed effects. | The operation achieves its required effect. Failed or partial effects stay explicit and cannot show completion. |
| Delivery verification result | Actual recipient-facing result, published artifact, or target state against agreed delivery acceptance conditions. | Required checks succeed and show the requested outcome for the delivered material. |
| Requested additional review result | Material and scope identified in an additional review request. | The requested review is complete and its blocking findings are resolved. |
| Applicable final approval record | Delivered result and decisions covered by an applicable final approval requirement. | The requester explicitly approves the identified material for the current Deliver attempt. |
| Recipient handoff result | Actual delivery references, instructions, limitations, recovery information, and remaining agreed responsibilities. | The designated recipient can identify the delivered result and required next actions. No delivery obligation is silently deferred. |

Authorization, additional review, and final approval rows apply when their stated requirements exist. Their conditional use does not waive required operations or outcome verification.

Bind evidence to this unit-scoped attempt, relevant inputs, repository checkpoint, external material, conditions, result, and retained supporting output. Keep original bindings when referring to upstream review evidence.

Apply the shared [evidence and approval bindings](../../runtime.md#evidence-and-approval-bindings), applicability rules, and retention rules. For repository approval material, create the output checkpoint before recording approval.

Keep required package or image identities, external responses, verification output, and observed target information when they show the outcome. A mutable tag, branch, or URL alone does not keep the reviewed material.

Exact event payloads, commands, record storage, and delivery adapters are still implementation work. This contract does not include a deployment engine or select a universal deployment mechanism.

## Handoff

**Standard workflow next stage:** None.

Supply the actual delivery location or recipient reference, material identity, verification result, current delivery instructions, and retained evidence references.

Identify known nonblocking limitations, recovery information, and recipient-owned next actions within the agreed outcome. Do not present missing required delivery work as future work.

Deliver completion closes this execution of the Standard workflow. It does not remove revision authority or authorize destructive cleanup. Unrelated units do not have to stop.
