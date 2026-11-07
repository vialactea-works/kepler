---
name: kepler-finish-work
description: Prepare, authorize, perform, verify, and hand off the delivery outcome requested for a reviewed Construction Unit of Work.
---

# Deliver

## When to Use

Use for the Standard Deliver stage after Unit of Work Review is complete for the current material. Deliver can end in an agreed repository handoff or another requested outcome. Publication, merge, release, and deployment are not automatic.

## Inputs and authority

Use the explicit unit and project scope and inspect current derived state:

```text
kepler workflow construction unit show --unit <unit-id> [--project <path>]
kepler workflow construction stage show --unit <unit-id> --stage deliver [--project <path>]
```

Start Deliver only when the Standard predecessor is complete and its current review/evidence is available:

```text
kepler workflow construction stage start --unit <unit-id> --stage deliver --request '<typed stage-input JSON>' [--project <path>]
```

Keep the returned exact Deliver attempt ID. On resume, inspect this same attempt and the actual target/effects; a successful prior command or agent report does not prove delivery. Read current unit definition, approved Functional Design and Quality Requirements, plan and graph, completed Review handoff, reviewed integrated checkpoint set, review evidence, applicable requester instructions, project delivery procedures, and known prerequisites. Keep source and deliverable identities distinct.

The requester controls the requested outcome and material consequential trade-offs. Apply applicable project and operation permissions. Earlier stage approval, successful Integration, or Review does not authorize any push, merge, pull/merge request, release, deployment, rollback, or cleanup. Ask for missing operation authority or a consequential choice. Do not infer it from silence or artifact presence.

## Procedure

1. **Resolve requested outcome and recipient.** Confirm the requested result, destination, recipient, reviewed source material, observable acceptance conditions, required operations and permissible verification. If the outcome is unspecified and project standards have no explicit default, ask the requester before operations. Record the requester's typed outcome as an interaction for the current Deliver attempt with `kepler audit record interaction --unit <unit-id> --stage deliver --attempt <deliver-attempt-id> [--project <path>]` and its typed JSON stdin. The request must faithfully identify the requester and include `delivery_outcome` fields `outcome`, `requested_outcome`, `destination`, and `recipient`. This records intent only; it grants no operation authority or final approval.
2. **Author delivery instructions.** Create or update unit-root `delivery.md` with valid metadata (`type: delivery-plan`) and the required Outcome and destination, Operations and prerequisites, Verification and recovery, and Decisions and open questions sections. Preserve its artifact UUID and original author. For a new artifact, use `kepler git author [--project <path>]` and `kepler uuid`; if Git name/email is absent, stop creation and identify the missing value. Put useful detail only under `details/deliver/`, link it from the relevant section, and do not create empty/unlinked files. State reviewed source checkpoint, exact intended deliverable, prerequisites, explicit permission source, expected result, verification method, failure boundary, limitations and recovery/recipient responsibilities. Do not store actual changing operation results in Markdown.
3. **Validate and self-review before effects.** Run `kepler lint <delivery.md> [supporting-file ...] --project <path>`. Review consistency with approved intent and the reviewed outcome, destination, material provenance, preconditions, permissions, order of operations, verifiable success conditions, recovery limits, and recipient handoff. If instructions imply an implementation, quality, plan, or functional change, return it to the orchestrator for authorized upstream revision; do not change reviewed behavior through `delivery.md`. Record actual validation and preparation/self-review evidence through `kepler audit record evidence --unit <unit-id> --stage deliver --attempt <deliver-attempt-id> [--project <path>]` with its accepted typed JSON request on stdin, bound to the current files, review, source material, relevant inputs, and conditions.
4. **Check permission and readiness for each operation.** Identify specific action, target, source material, required credential/permission and authority reference. Confirm prerequisites and target conditions before the affected operation. Obtain explicit requester direction or existing project authority where required. A recorded reference documents caller-provided authority; it does not authenticate it. If permission, material, or environment is missing, keep the scope incomplete and report what is needed. Continue independent safe preparation only.
5. **Perform only the authorized outcome.** Execute the minimal project-native operation(s) named by the requester and the checked delivery instructions. Keep repository, remote, release, or deployment authority scoped to those instructions. Do not add convenience pushes, tags, merges, rollout, rollback, retries with possible duplicate effects, or cleanup. Capture actual command/result, inputs, actor, target and any partial effects. A shell/process exit alone does not establish a recipient-facing effect.
6. **Verify every required operation and the requested outcome.** Read back actual remote refs, pull/merge request, release artifact, deployment target, or recipient handoff as applicable; check its identity, material provenance, state, and acceptance conditions. Use only checks justified by the requested outcome and applicable project obligations. Do not add unconditional full-suite/build checks or universal health checks. If a required check is unavailable, fails, or covers stale material, do not claim completion. Record each actual operation result and outcome-verification result with `kepler audit record evidence --unit <unit-id> --stage deliver --attempt <deliver-attempt-id> [--project <path>]`, using separate appropriate typed records, original opaque references and relevant checkpoint/condition bindings. Evidence records observations; it does not perform operations or authorize them.
7. **Handle failure and partial effects.** If an operation fails or is interrupted, stop forward actions and inspect actual local and external state before retrying. Use Kepler's structured failed-result envelope (`status: failed`, exit 1, `data.code`, `message`, `details`, `recovery`) and include known partial effects in `details`; failure does not mean nothing changed, and recovery text grants no authority. For shell/provider operations, capture the actual diagnostic and separately read back remote state. Record which steps succeeded, failed, remain unknown, and exact next safe action. Preserve current attempt, review, source material, work and evidence. Retry only after ruling out duplicate effects and confirming authority; no operation failure grants rollback or cleanup.
8. **Obtain conditional approval.** Do not add a blanket final-approval gate. If a specific authority rule or requester instruction requires approval, identify exactly what result and material it covers; finish and commit repository output first when the rule requires a checkpoint, then record the requester's explicit decision using `kepler audit record approval --unit <unit-id> --stage deliver --attempt <deliver-attempt-id> [--project <path>]` with its typed JSON stdin. A delivery outcome interaction, prior stage approval, positive review, or successful command is not this approval.
9. **Answer reopening questions and complete.** Evaluate all six questions below against current instructions, actual effects, verification and recovery. Report findings and proposed earliest boundary to the orchestrator; answers do not authorize reopening. If authorized reopening changes upstream material, repeat affected later stages and obtain a fresh Review before delivery. For a delivery-only instruction change within authority, repeat affected validation/self-review and evidence while preserving prior history and current attempt. Complete only when all required effects are verified, no blocking operation/partial effect remains unknown, applicable approval is recorded, and recipient handoff is complete. Recheck state, then use `kepler workflow construction stage complete --unit <unit-id> --stage deliver --attempt <deliver-attempt-id> --request '<typed outcome/evidence JSON>' [--project <path>]`. Process success alone is not proof of completion.
10. **Hand off.** Give recipient the verified result location/identifier, reviewed source identity, actual operations and verification, relevant usage/operation instructions, known limitations, recovery information, and remaining recipient responsibilities. Report only effects read back and recorded through CLI-owned evidence.

## Reopening questionnaire

Evaluate each question against the current delivery request, selected material, actual effects, verification, and recovery. Report every answer, supporting facts, uncertainty, and proposed earliest boundary to the orchestrator.

1. Is a change to the requested delivery outcome, destination, recipient, or acceptance condition necessary?
2. Does selected material differ from the reviewed implementation or lack required provenance?
3. Does a missing prerequisite, permission, or changed target condition invalidate the delivery procedure?
4. Do actual effects or required verification results invalidate the claimed outcome?
5. Does a failure or partial effect invalidate the planned recovery, retry, or recipient handoff?
6. Is an implementation or upstream contract change necessary rather than a delivery-only correction?

A Yes answer gives the orchestrator a reason to examine this stage as a possible revision boundary. All No answers identify no independent reason to reopen it for this finding, but do not exempt a downstream stage from a cascade authorized upstream. Answers do not authorize reopening or expand existing authority for external operations.

The Deliver agent reports findings and proposes a boundary; it does not authorize reopening or start a revision cascade. The orchestrator compares the finding with current evidence and decisions, then decides whether to continue, investigate, or authorize reopening from the earliest affected stage. It records that decision. After authorization, the orchestrator reopens the affected stage and every downstream stage within the selected scope. Previous completion does not establish completion for revised work. Local instruction or operation corrections can stay within the active Deliver attempt when upstream contracts remain valid.

These rules follow the accepted contracts at `docs/specs/v3/phases/construction/deliver.md#reopening-questionnaire` and `docs/specs/v3/revision.md`; those paths identify source provenance and are not runtime dependencies.

## Recovery boundaries

A paused or interrupted operation keeps its current unended Deliver attempt. Confirm that earlier operations/workers stopped, inspect their external effects, and resume only the first unverified safe step. A failed command, absent session, timeout, or incomplete response does not prove no effect. Keep incomplete delivery incomplete. Do not repeat a potentially non-idempotent action until actual state and permission are confirmed.

Keep work and evidence. Do not automatically roll back, delete resources, reset branches, remove worktrees, clean deployment artifacts, or compensate. Obtain separate authority for any such action. Reopened Deliver uses a new attempt when it executes again and cannot inherit old completion; preserve prior operation/evidence bindings. If a verified outcome already occurred, do not perform it a second time just to create a new attempt's result; report and follow orchestrator-authorized recovery.

## Handoff

This is the final Standard stage. Provide the recipient and orchestrator the current `delivery.md`, verified outcome, target and material identities, actual operation/result evidence, any applicable approval receipt, partial-effect/recovery facts, and remaining agreed responsibilities. Repository handoff can complete without publication or deployment when that is the requested outcome. Do not describe unfinished required deployment as complete or silently defer it.