---
name: kepler-code
description: Implement the assigned task's Code Generation Activity under the current v3 Construction contract.
---

# Code Generation

Use the [packaged agent operations](../kepler-mission-startup/references/agent-operations.md) and complete request examples to build strict CLI requests and capture actual evidence. The developer invokes the orchestrator, not you for each task. Return exact checked output and evidence to the orchestrator; never ask the developer to run task commands or select attempt IDs.

## When to Use

Use only for the Code Generation Activity of one explicitly assigned and admitted task within a current unit Implementation attempt. Do not use this skill for independent Validation or task Integration.

## Inputs and authority

Require the explicit unit ID, task UUID and current task definition, active unit Implementation attempt ID, authorized Code Generation Activity occurrence, current Generation attempt if resuming, fixed repository-qualified task admission baseline, prerequisite outputs, relevant upstream artifact versions, applicable quality constraints and sources, project-native checks, workspace binding, and any prior authorized return findings. The orchestrator owns readiness, task admission, dispatch, scope reservation and integration. This worker may not dispatch tasks, edit the graph or root progress, accept an Integration candidate, complete the task, or authorize a return.

Read the task with `kepler workflow construction task show --unit <unit-id> --task <task-id> [--project <path>]`; inspect Activity state with `kepler workflow construction activity show --unit <unit-id> --task <task-id> --activity code-generation --implementation-attempt <implementation-attempt-id> [--project <path>]`. Do not infer task identity from its title or select the latest unit/task implicitly. On an authorized first execution, start the Activity with:

```text
kepler workflow construction activity start --unit <unit-id> --task <task-id> --activity code-generation --implementation-attempt <implementation-attempt-id> [--project <path>]
```

Keep the returned distinct Activity attempt ID. If already active, resume only that same unended attempt after verifying prior workers stopped and current bindings/material remain valid. Waits, new sessions, failed commands, local corrections, pauses and resumes do not mint another attempt. A task is not itself an attempt.

When this skill is loaded from the distributed complete Kepler package, consult `../../guidelines/general/01-code-style.md` and relevant language guidance under `../../guidelines/<language>/` relative to this installed `SKILL.md` when available. Project standards and requester instructions take priority. These are same-generation package assets, never paths to infer from project cwd or legacy global copies.

## Procedure

1. Verify the current unit/task/attempt binding, admitted repository checkpoint set and exact task definition. Read approved `unit-of-work.md`, `design.md`, `quality.md`, `plan.md`, graph task fields, source and standards relevant to this task. Use the fixed admission baseline and integrated predecessor outputs; do not change the baseline when other work integrates. Do not inspect sibling task evidence. Follow task `guidance`, verification `method`, and prerequisite conditions. If a required input is missing, stale, ambiguous, or outside authority, preserve work and report it to the orchestrator.
2. Make only changes needed for the assigned task's goal and observable acceptance, including tests, required configuration and documentation. Follow the selected technical solution and project patterns. Keep domain/use-case boundaries and project standards. Do not silently alter functional behavior, quality targets, public contracts, task dependencies, security policy, or approved scope. Return upstream conflicts or new obligations to their owner.
3. Test behavior at the lowest level that proves the change: unit tests for isolated contracts, integration tests for real collaborations, and E2E tests for critical end-to-end behavior. Include relevant failures and boundaries. Set up infrastructure planned for this task before checks depend on it. Use repository-native commands in `plan.md` and this task's verification method; do not autodetect commands, invent success, or run arbitrary prose as a shell command. Generation must run typechecking and modification-related tests. It does not replace Validation's project build/full suite or Integration's combined-candidate checks.
4. For each behavior change, use Red → Green → Refactor:
   - **Red:** add or update a behavioral test and run it before production edits. Record the exact command and intended observed failure. If conventional Red is technically impossible, document why and a repeatable pre/post alternative, then run it before implementation.
   - **Green:** make the smallest passing change and rerun the same check; record actual result before refactoring.
   - **Refactor:** make behavior-preserving cleanup and rerun relevant behavior/regression checks. If behavior changes, restart at Red. Do not invent tests for a purely mechanical change, but explain the verification that proves its intended result.
5. Run the planned typecheck and tests related to modifications against the identified output. Review the resulting implementation, tests and required docs against each acceptance criterion, applicable quality obligation, failure case and scope limit. Correct local defects in the same Generation attempt and repeat the relevant TDD cycle. Report unresolved or upstream findings; do not change authority to make the checks pass.
6. Prepare repository output checkpoints through normal task work. For repository material, commit the output before recording evidence that binds to it. Record actual typecheck, modification-related test, self-review and output checkpoint facts with `kepler audit record evidence --unit <unit-id> --task <task-id> --activity code-generation --attempt <generation-attempt-id> [--project <path>]`, using one typed JSON object on stdin. Include `inputs` with opaque `reference` and `purpose`, executor, actual result, conditions and supporting output. Do not parse/normalize references or record a failed check as passing. Evidence recording does not execute checks.
7. Complete only the current Generation attempt after its evidence matches output material:

   ```text
   kepler workflow construction activity complete --unit <unit-id> --task <task-id> --activity code-generation --implementation-attempt <implementation-attempt-id> --attempt <generation-attempt-id> --evidence '<JSON evidence IDs>' [--project <path>]
   ```

   The typed request is the CLI's `evidence_ids` object. Successful Activity completion makes output eligible for Validation; it does not complete the task, Implementation, or unit.
8. Return facts to the orchestrator: unit/task IDs, Implementation and Generation attempt IDs, output checkpoint set and commit(s), exact check commands and results, acceptance coverage, self-review result, evidence receipt IDs, and unresolved concerns. Supply source bindings needed for an optional Validation diff package. Do not provide a narrative in place of task evidence, launch Validation yourself, or accept Integration.

## Correction and recovery

For authorized task-local correction, repeat required Activity work under the correct current attempt sequence. A return to Generation means the orchestrator authorizes Generation, then subsequent Validation and Integration as required; start a new Generation attempt only when the occurrence executes again under an authorized return. Preserve prior attempts and original bindings. A correction or failed command inside the same current unended Generation attempt keeps that attempt.

On interruption, query Activity and task state; inspect the assigned work and evidence. Confirm the prior worker is stopped before continuing. Preserve partial changes and the fixed admission baseline. A missing response, timeout, commit, or successful command alone does not prove completion. Report uncertainty rather than writing journals or deciding to reopen.

## Handoff

Hand off checked generated material and its current evidence to the independent Code Validation context. Identify actual repository checkpoints, original admission baseline, task output and input bindings, attempt IDs, commands/results, tests, self-review, conditions, limitations, and any correction findings. Validation must examine actual material, run typecheck/build/full suite, and give non-author feedback. Keep this Generation result separate from Validation and later Integration evidence.
