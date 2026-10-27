---
name: kepler-review
description: Independently assess whether the complete integrated Unit of Work satisfies its current contracts and evidence obligations.
---

# Unit of Work Review

## When to Use

Use for the Standard Unit of Work Review stage after Implementation has completed its own assessment for the current unit. Review the integrated outcome independently; task-level feedback is not a substitute.

## Inputs and authority

Work from explicit unit/project selectors and current CLI state. Inspect:

```text
kepler workflow construction unit show --unit <unit-id> [--project <path>]
kepler workflow construction stage show --unit <unit-id> --stage unit-of-work-review [--project <path>]
```

Start the eligible review attempt with the owning CLI operation and its typed stage-input request:

```text
kepler workflow construction stage start --unit <unit-id> --stage unit-of-work-review --request '<typed stage-input JSON>' [--project <path>]
```

Keep the returned exact Review attempt. Read current `unit-of-work.md`, `design.md`, `quality.md`, `plan.md`, `tasks-dag.json`, relevant supporting files, the Implementation completion assessment, final integrated repository-qualified checkpoint set, task/Activity history, applicable reviewer findings, and known delivery constraints. Use original bindings when consuming upstream evidence. Do not infer the active attempt, destination, or applicable material from a branch name, commit message, or review package alone.

Review the complete unit outcome, including relevant unchanged behavior, interactions, failure paths, quality obligations, and necessary operational/deployment preparation. The reviewer must not be the primary implementation author. Do not edit implementation, tests, or upstream contracts. Report facts and proposed revision boundaries; only the orchestrator authorizes reopening. This skill does not run an unconditional full build or test suite, replace required Activity checks, create external review requests, or authorize delivery.

## Procedure

1. Confirm that Implementation is complete under its contract, the current integrated result is explicit, review scope and acceptance conditions are sufficient, and required evidence is accessible. If an upstream record is missing or invalid, preserve evidence and report the affected boundary rather than treating a Review opinion as substitute completion.
2. Read and compare the complete outcome with the unit purpose/scope, accepted functional behavior and contracts, applicable quality requirements and their conditions, the technical plan, task outcomes, and known deployment constraints. Examine component interactions, compatibility, failure behavior, and material omissions, including relevant unchanged code/configuration. Include the complete integrated checkpoint set, not only individual task diffs.
3. Determine evidence applicability obligation by obligation. Check whether required Generation, independent Validation, Integration, and Implementation assessment records cover current material, inputs, repository set, conditions, and attempt. Keep originating scope/attempt/checkpoint bindings; do not transfer Activity evidence into the Review attempt. A successful task check is evidence only for what it actually covered. Missing required upstream evidence is an upstream completion defect; new Review checks do not retroactively complete that earlier attempt.
4. For optional package-assisted inspection, use the source-bound whole-unit package:

   ```text
   kepler git diff-package unit-review --unit <unit-id> --implementation-attempt <implementation-attempt-id> [--project <path>] [--out <path>]
   ```

   It starts at the original Unit of Work Review baseline captured before first task admission and ends at the final set from the selected Implementation completion assessment. Check the complete outcome and relevant unchanged behavior; never narrow the review to changed lines or substitute a target-branch merge base. The package is inspection input, not a gate, evidence result, or authority.
5. Run an extra check only when a concrete uncovered obligation or current condition requires it, and only with applicable permission. Choose the narrowest check that can establish the needed fact. Record why it applies, exact command, environment/conditions, actual result, material/input bindings, and retained output. Do not rerun typecheck/build/full suite solely because Review started or a checkpoint ID changed. Apply the shared evidence-applicability rules.
6. Report concrete findings with the violated obligation, located evidence, uncertainty, affected material, and proposed earliest correction boundary. Distinguish blocking defects/missing proof from nonblocking limitations; do not present an unmet obligation as an allowed limitation. The orchestrator selects a revision scope. Upstream revision invalidates affected downstream completion even if some bytes are unchanged. After authorized reopening, reassess the new material/attempt and any retained Activity evidence under their original bindings.
7. Self-review coverage across the full unit, interactions, known failure behavior, all applicable obligations, evidence applicability, blocking findings, uncertainties, and the Deliver handoff. Additional external review occurs only when requested. If a material requester decision remains necessary, pass it to the orchestrator; do not invent an answer.
8. Record the actual assessment and any conditional checks through `kepler audit record evidence --unit <unit-id> --stage unit-of-work-review --attempt <review-attempt-id> [--project <path>]`, using one accepted typed JSON request on stdin. Bind the result to the Review attempt, complete integrated material, relevant inputs, conditions, assessment, findings, and supporting output. Keep reference strings opaque and original. Evidence recording does not perform the check.
9. Obtain separate requester acceptance only when an applicable authority rule or requester instruction requires it. Ask the requester to accept the actual integrated result, assessment, limitations and decisions covered. Record explicit acceptance with `kepler audit record approval --unit <unit-id> --stage unit-of-work-review --attempt <review-attempt-id> [--project <path>]` and its accepted typed request. A review verdict, successful check, or commit is not consent. Do not request blanket approval otherwise.
10. Answer every Review reopening question below and report findings/proposed boundary to the orchestrator. Answers do not authorize reopening. When authorized revision occurs, repeat Review's applicable coverage and evidence work; do not reuse earlier completion as current.
11. Recheck current state and complete only when the whole-unit assessment, evidence applicability, blocking findings, any requested external review, and any applicable requester acceptance satisfy the contract. Use `kepler workflow construction stage show --unit <unit-id> --stage unit-of-work-review [--project <path>]`, then the accepted typed request:

   ```text
   kepler workflow construction stage complete --unit <unit-id> --stage unit-of-work-review --attempt <review-attempt-id> --request '<typed assessment/evidence JSON>' [--project <path>]
   ```

   Process success alone does not prove completion. No publication, release, deployment, or cleanup permission follows.

## Reopening questionnaire

Answer all five questions from [Unit of Work Review: Reopening questionnaire](../../docs/specs/v3/phases/construction/unit-of-work-review.md#reopening-questionnaire): does a finding invalidate the whole-unit conclusion/coverage; does material or a relevant input differ; is a blocker unresolved or missing authorization; does evidence fail to prove upstream completion or unit acceptance; is applicable requester acceptance stale or insufficient? Report answers and proposed earliest boundary. The orchestrator decides reopening.

## Handoff

Supply the unit directory and current upstream artifacts, final integrated checkpoint set, complete outcome assessment, evidence applicability/coverage, findings and resolutions, nonblocking limits, current Review attempt, and evidence receipts. Include applicable requester acceptance only when required. Identify known delivery constraints and pass the reviewed material and findings to Deliver. A successful Review does not authorize push, merge, publication, release, deployment, or cleanup.