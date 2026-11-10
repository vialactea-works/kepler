# Stage completion assessments

Use this reference to build the JSON input for `workflow construction stage complete`. It describes the implemented validators. It does not define new specification requirements. Use the [tutorial](../missions/tutorial.md) for complete request construction and execution order.

## Common rules

Every call selects `--unit`, `--stage`, and the current `--attempt`, plus optional `--project`. Supply one complete `--request` object. Unknown fields fail. IDs select existing records; text that claims a check passed does not create its evidence.

- An evidence reference uses `evidence_id` or an evidence-ID field.
- Approval and completion references use event IDs.
- An artifact binding has `artifact_id` and `content_version: "sha256:<hex>"`.
- A checkpoint has `repository_id` and a full `commit` ID.
- A graph reference has `graph_id` and its exact `content_version`.
- An input has a non-empty `reference` and `purpose`.

Material, attempt, evidence, and checkpoint bindings must agree. Primary Markdown and linked support must pass their readers. Commit the required material before recording evidence that binds a committed checkpoint.

The tables use dotted names to show nested fields. Dots are notation, not literal JSON keys. All fields are required unless marked optional or conditional. Empty arrays are permitted only where the validator and completion guards allow them.

## Functional Design

Primary files: `unit-of-work.md` and `design.md`. Linked Functional Design support is also part of the selected material.

Top-level fields are `approval_event_id` and `assessments`. `assessments` has exactly `self_review`, `decision_resolution`, and `handoff`.

| Assessment | Fields and accepted values |
| --- | --- |
| `self_review` | `status: "passed"`, `evidence_id`, `reviewer`, `summary`, `checks`, `findings: []`. |
| `decision_resolution` | `status: "resolved"`, `evidence_id`, `summary`, `resolved_material_choices`, `unresolved_material_choices: []`, `unsupported_assumptions: []`, `quality_concerns`, `technical_questions`. |
| `handoff` | `status: "ready"`, `evidence_id`, `summary`, `recipient: "quality-requirements"`, `unit_directory`, `artifacts`, `project_references`, `known_constraints`, `quality_concerns`, `technical_questions`. |

The self-review checks are exactly `required-content`, `observable-acceptance`, `consistency`, `blocking-questions`, and `downstream-handoff`.

A resolved choice has `choice`, `owner`, and `resolution`. A quality concern has `concern`, `responsible_stage: "quality-requirements"`, and `owner`. A technical question has `question`, `responsible_stage: "implementation-planning"`, and `owner`. The decision and handoff concern/question arrays must agree.

The three distinct evidence records use `functional-design-self-review`, `functional-design-decision-resolution`, and `functional-design-quality-handoff`. Approval must bind the current material and attempt. The handoff names the exact unit directory and material paths.

Source: [Functional Design request validator](../../packages/cli/src/construction/functional-design-completion.ts) and [completion operation](../../packages/cli/src/construction/stage-completion.ts).

## Quality Requirements

Primary file: `quality.md`. Completion also retains accepted Functional Design bindings.

Top-level fields are `approval_event_id` and `assessments`. Assessments have `artifact_validation`, `self_review`, `external_review`, and `handoff`.

| Assessment | Fields and accepted values |
| --- | --- |
| `artifact_validation` | `evidence_id`, `summary`. |
| `self_review` | `status: "passed"`, `evidence_id`, `reviewer`, `summary`, `checks`, `categories`, `requirements`, `resolved_material_choices`, `unresolved_material_choices: []`, `unresolved_material_targets: []`, `unresolved_tradeoffs: []`, `unsupported_assumptions: []`. |
| `external_review` | `{ "requested": false }`, or `requested: true` with `request_event_id`, `evidence_id`, `reviewer`, `summary`, and `findings: []`. |
| `handoff` | `status: "ready"`, `summary`, `recipient: "implementation-planning"`, `unit_directory`, `artifacts`, `requirement_references`, `constraints`, `assumptions`, `planning_questions`. |

The self-review checks are exactly `category-applicability`, `objective-conditions`, `consistency`, `material-decisions`, and `planning-handoff`.

Assess each category once: `performance`, `availability`, `security`, `accessibility`, `compatibility`, `operability`, `observability`, and `maintainability`. A category item has `category`, boolean `applies`, and `rationale`.

A requirement has `category`, `reference`, `scope`, `conditions`, `target`, `acceptance_condition`, and `owner`. It must correspond to an applicable category. A resolved choice has `choice`, `owner`, and `resolution`.

Required evidence names are `quality-artifact-validation` and `quality-self-review`. Requested external review needs its matching requester interaction and `quality-external-review` evidence. The approval selects the current Quality material, not an older design approval.

Source: [Quality request validator](../../packages/cli/src/construction/quality-requirements-completion.ts) and [completion operation](../../packages/cli/src/construction/quality-stage-completion.ts).

## Implementation Planning

Primary files: `plan.md` and its linked canonical `tasks-dag.json`. The graph has its own identity and byte hash. Completion binds current accepted design and quality material as well as the plan.

Top-level fields are `assessments` and conditional `approval_event_id`. Assessments have these objects:

| Assessment | Fields and accepted values |
| --- | --- |
| `artifact_validation` | `evidence_id`, `summary`. |
| `task_graph_validation` | `evidence_id`, `summary`. |
| `self_review` | `status: "passed"`, `evidence_id`, `reviewer`, `summary`, `checks`, `decision_rationales`, `task_reviews`, `obligation_coverage`, `unresolved_consequential_decisions: []`, `unsupported_assumptions: []`. |
| `external_review` | `{ "requested": false }`, or `requested: true` with `request_event_id`, `evidence_id`, `reviewer`, `summary`, `findings: []`. |
| `approval_requirement` | `required: false` with `rationale`, or `required: true` with `rationale` and `basis`. |
| `handoff` | `status: "ready"`, `summary`, `recipient: "implementation"`, `unit_directory`, `artifacts`, `input_bindings`, `graph_ref`, `task_ids`, `verification_obligations`, `prerequisite_conditions`, `coordination_constraints`, `approval_required`. |

The eight self-review checks are `decision-rationale`, `obligation-coverage`, `consistency`, `dependency-reasons`, `prerequisite-conditions`, `verification-feasibility`, `input-relevance`, and `blocking-decisions`.

A decision rationale has `decision` and `rationale`. Each task review has `task_id`, `inputs_relevant`, `outputs_explicit`, `acceptance_testable`, `dependency_reasons_justified`, `prerequisites_conditioned`, `verification_feasible`, and `rationale`. All six booleans must be `true` for completion. Base each value on the actual task review.

An obligation-coverage item has `reference`, `disposition`, `task_ids`, and `rationale`. Disposition is `planned` or `unchanged-behavior`. Preserve the applicable input obligations and justified coverage.

An approval basis is either `{ "kind": "requester-instruction", "request_event_id": "<event-id>" }` or `{ "kind": "authority-rule", "reference": "<authority-reference>" }`. Required approval needs a matching current approval event. Do not invent an approval requirement or omit an existing one.

The handoff binds exact input artifacts, graph version, and task IDs. Its verification-obligation text and prerequisite-condition text must correspond to the graph. Use the complete serialization shown in the tutorial, rather than a shortened summary.

Required evidence names are `planning-artifact-validation`, `planning-task-graph-validation`, and `planning-self-review`. Requested external review uses `planning-external-review` and the matching request.

Source: [Planning request validator](../../packages/cli/src/construction/implementation-planning-completion.ts) and [completion operation](../../packages/cli/src/construction/planning-stage-completion.ts).

## Implementation

Complete every planned task through its guarded Activities before completing Implementation. The request has:

| Field | Meaning |
| --- | --- |
| `self_review_evidence_id` | Current `implementation-self-review` result. |
| `handoff_evidence_id` | Current `implementation-review-handoff` result. |
| `unit_check_evidence_ids` | Non-empty distinct combined-result check evidence IDs. |
| `retained_scope_assessment_event_ids` | Recorded current retained-scope assessment event IDs, or an empty array when none apply. |
| `additional_review` | Explicit requested-review state described below. |
| `blocking_findings` | Empty array for successful completion. |
| `handoff_assessment` | `status: "ready"`, `reason`, `recipient: "unit-of-work-review"`, and complete `artifacts` list. |

Additional review is `{ "requested": false }`, or `requested: true` with `request_event_id`, `evidence_id`, `reviewer`, and `findings: []`. A requested review must have matching current requester and evidence facts.

The CLI validates completed tasks, accepted Integration, original and retained evidence, current material, and final checkpoints. It records an Implementation assessment and typed completion. It does not treat the worker's `done` message as proof.

Source: [Implementation completion](../../packages/cli/src/construction/implementation-stage-completion.ts) and [retained-scope assessment](../../packages/cli/src/construction/implementation-retained-scope-assessment.ts).

## Unit of Work Review

The request has these fields:

| Field | Meaning |
| --- | --- |
| `implementation_completion_event_id` | Current typed Implementation completion. |
| `reviewed_material_bindings` | Exact reviewed upstream material. |
| `final_checkpoints` | Exact final reviewed repository commits. |
| `reviewer` | Non-empty reviewer identity. Must be a non-author of Implementation. |
| `implementation_authors` | Actual Implementation author identity array. |
| `implementation_evidence_assessment_id` | `implementation-evidence-assessment` evidence. |
| `review_evidence_id` | `unit-of-work-review` evidence. |
| `self_review_evidence_id` | `unit-of-work-review-self-review` evidence. |
| `findings` | `blocking: []` and `limitations`, where each limitation has `finding` and `rationale`. |
| `additional_review` | Explicit unrequested state, or requested state with current request/evidence/reviewer and empty findings. |
| `acceptance_required` | Whether applicable authority requires acceptance. |
| `approval_event_id` | Conditional current approval event when acceptance is required. |
| `handoff` | `status: "ready"`, `recipient: "deliver"`, and non-empty `summary`. |

Use the same reviewed checkpoints in the evidence and request. A record can describe an actual limitation without making a blocking finding disappear. Do not mark acceptance as unnecessary when requester or project authority requires it.

Source: [Review completion](../../packages/cli/src/construction/unit-of-work-review-completion.ts) and [typed event records](../../packages/cli/src/construction/events.ts).

## Deliver

Before delivery, record a requester interaction with the exact `delivery_outcome`. The completion must match that selection.

| Field | Meaning |
| --- | --- |
| `review_completion_event_id` | Current ready Unit of Work Review completion. |
| `outcome_request_event_id` | Current requester interaction recorded before delivery. |
| `outcome` | `repository-handoff`, `review-request`, `publication`, `deployment`, or `other`. |
| `requested_outcome`, `destination`, `recipient` | Exact non-empty values from the outcome selection. |
| `artifact_bindings` | Reviewed material plus current `delivery.md` and linked delivery support. |
| `reviewed_checkpoints` | Source commits accepted by Review. They differ from later delivery-instruction commits when applicable. |
| `preparation_evidence_id` | Current `deliver-preparation` result. |
| `self_review_evidence_id` | Current `deliver-self-review` result. |
| `operation_results` | Authorized completed external/local operation results. May be empty only for `repository-handoff`. |
| `verification_evidence_ids` | Non-empty distinct `deliver-outcome-verification` evidence IDs. |
| `handoff_evidence_id` | Current `deliver-recipient-handoff` result. |
| `additional_review` | Optional explicit unrequested state or fully bound requested review. |
| `approval_required` | Applicable final approval requirement. |
| `approval_event_id` | Conditional current approval event. Omit when not required. |
| `handoff` | `status: "ready"` and a non-empty actual-result `summary`. |

Each operation result has `operation`, `status: "succeeded"`, `evidence_id`, `source_checkpoints`, and `authority`. Evidence uses `deliver-operation-result`. Source checkpoints must be the exact reviewed source set.

Authority is either `{ "kind": "requester-instruction", "event_id": "<interaction-id>" }` or `{ "kind": "project-authority", "reference": "<authority-reference>" }`. Record actual permission before performing the operation. No delivery outcome grants permission automatically.

Outcome-verification evidence uses `related_request_event_id` for the selected outcome and `related_event_ids` for each operation result it verifies. Recipient-handoff evidence must depend on the preparation, self-review, every operation result, and every outcome-verification event. Supply those **event IDs**, not evidence IDs, through `related_event_ids`.

All delivery evidence binds the current delivery material and actual delivery checkpoint set. The request separately retains the earlier reviewed source commits. Passing text with missing causal links fails completion. Keep non-empty output references for verification and recipient handoff.

Completion records the final Standard stage. It does not invoke publication, deployment, or a separate mission-finish operation. A failed or partial external operation prevents successful delivery completion.

Source: [Deliver completion](../../packages/cli/src/construction/deliver-stage-completion.ts) and [event validation](../../packages/cli/src/construction/events.ts).

## Failures and related procedures

An invalid request, missing current evidence, mismatched checkpoint, stale artifact, missing authority, or unsafe coordination condition fails with exit 1. Read the structured details. Preserve recorded work. Use an explicit corrected operation when retry is safe; use [Recovery](../recovery.md) when attempt or ownership facts are uncertain.

See [Construction commands](construction.md#stage-complete), [Audit](audit.md), and the [complete mission tutorial](../missions/tutorial.md).
