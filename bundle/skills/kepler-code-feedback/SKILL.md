---
name: kepler-code-feedback
description: Independently validate one task's generated output and record Code Validation evidence without editing the candidate.
---

# Code Validation

## When to Use

Use for the Code Validation Activity of one explicitly assigned task after Code Generation has completed. Review the actual candidate as a non-author. This skill is not whole-unit Review and does not perform Code Integration.

## Inputs and authority

Require explicit unit ID, task UUID and current task definition, enclosing Implementation attempt ID, authorized Code Validation Activity and its exact attempt ID if resumed, original fixed task admission baseline, actual Generation output checkpoints and attempt, Generation evidence, applicable upstream functional/quality inputs, task verification commands/resources, project standards, and any requested scope. If material/inputs have changed, Generation evidence does not silently transfer. Request missing/ambiguous inputs from the orchestrator. Do not inspect sibling task evidence or mutate the task graph, implementation, tests, root progress or journals.

Query state using:

```text
kepler workflow construction task show --unit <unit-id> --task <task-id> [--project <path>]
kepler workflow construction activity show --unit <unit-id> --task <task-id> --activity code-validation --implementation-attempt <implementation-attempt-id> [--project <path>]
```

Start only the eligible Validation occurrence under the same current Implementation attempt:

```text
kepler workflow construction activity start --unit <unit-id> --task <task-id> --activity code-validation --implementation-attempt <implementation-attempt-id> [--project <path>]
```

Retain its returned Activity-attempt ID. Generation and Validation require separate worker contexts. Confirm the reviewer did not author the candidate. An optional package is made from the original source attempt and admission baseline, with no consumer-attempt selector:

```text
kepler git diff-package validation --unit <unit-id> --task <task-id> --implementation-attempt <implementation-attempt-id> --generation-attempt <generation-attempt-id> [--project <path>] [--out <path>]
```

Review actual material and its bindings, not only this package or the author's summary. The package neither proves checks nor replaces current Validation evidence.

## Procedure

1. Compare the actual generated output with its fixed admission baseline, task acceptance and failure boundaries, unit functional design, applicable quality requirements, selected technical solution, relevant input versions, and project standards. Verify repository-qualified commits/paths and any relevant changed condition. Distinguish task output from predecessor or peer material using actual history/provenance. Do not infer source ownership from timestamps or reference strings.
2. Run all required Validation checks against the actual task output using exact planned, repository-native commands and task `verification.method` conditions:
   - Typechecking.
   - The project build.
   - The full application test suite.

   Record command, actual result, scope, covered material, environment/conditions, executor, and retained output. A build counts as typechecking only if it performs typechecking. A failed, skipped, incomplete, or unavailable check is not success; report the blocker without claiming Validation completion. Apply project-specific required checks without adding a general check policy.
3. Give independent feedback on correctness, failure behavior, boundary behavior, test coverage, applicable quality obligations, security, and unintended effects. Do not author or edit implementation, tests, configuration, or documentation. Identify each blocker with exact location, violated task/upstream obligation, evidence, and a proposed correction boundary. Separate code defect from missing proof, uncertainty, or upstream intent conflict. A preference does not change the task contract.
4. Review that the Generation self-review and TDD evidence address the task's acceptance and current material. Check results against located files/commands rather than accepting claims. Do not treat an optional diff package as a check result. If independent feedback itself needs correction while the candidate stays unchanged, fix the assessment and keep the current Validation attempt. If the candidate or relevant inputs change, report to the orchestrator; it authorizes a return and determines which later Activities must run again.
5. Self-review the assessment for correctness and coverage: every acceptance criterion, relevant functional and quality obligation, required check, observed result, blocking finding, and uncertainty is addressed. Record actual check results, independent review findings, self-review, conditions and source/material bindings through `kepler audit record evidence --unit <unit-id> --task <task-id> --activity code-validation --attempt <validation-attempt-id> [--project <path>]` with one accepted typed JSON object on stdin. Bind the evidence to the current Validation attempt and actual reviewed material using `inputs` entries with opaque `reference`/`purpose`; do not infer paths or normalize references. Evidence recording does not run checks or authorize Integration.
6. Complete Validation only if typecheck, build and full application suite pass on the reviewed material, independent non-author feedback and assessment self-review are complete, and no blocking findings remain:

   ```text
   kepler workflow construction activity complete --unit <unit-id> --task <task-id> --activity code-validation --implementation-attempt <implementation-attempt-id> --attempt <validation-attempt-id> --evidence '<JSON evidence IDs>' [--project <path>]
   ```

   Use the accepted typed `evidence_ids` request. Keep failed results as failed evidence; never report a passed outcome or complete on process exit alone.
7. Report to the orchestrator the exact unit/task and Implementation/Generation/Validation attempt IDs, fixed baseline and reviewed output checkpoints, check commands/results, independent feedback, blocking findings and their proposed boundary, evidence receipt IDs, and limitations. Successful Validation makes the task eligible for Integration only; it does not accept a combined candidate or complete the task.

## Findings, correction, and recovery

Do not fix a reviewed candidate. A confirmed code defect goes to the orchestrator for an authorized task-local return to Code Generation. Code changes require relevant new verification, new required Validation work and subsequent Integration. Keep an evidence gap distinct from a code defect; provide the located proof or exact missing check. Route a defect in approved intent or quality requirements to the owning stage, not to a worker as a workaround. A question/proposed boundary does not authorize reopening.

A failed command or correction within this current unended Validation attempt does not create a new attempt. An authorized return creates a new Activity attempt when Validation executes again. On interruption, retain current attempt and evidence, verify previous reviewer stopped, and resume only after checking current inputs, candidate, lock/workspace state if applicable, and ownership. A timeout or missing response is not a completed review.

## Handoff

Provide actual material identity and bindings, full check results and conditions, independent non-author findings, self-review, current attempt and evidence receipts, and resolved/blocking issues. The orchestrator hands successful Validation to the separate Code Integration process. Integration captures the then-current unit checkpoint under lock, combines candidate inputs, reruns typecheck/build/full suite, and accepts only the checked candidate. Validation does not accept it.
