---
name: kepler-plan
description: Select and document the technical solution and task graph for a Construction Unit of Work.
---

# Implementation Planning

## When to Use

Use when Implementation Planning is the current Standard stage and current Functional Design and Quality Requirements outputs and their required evidence are available. Existing code, tests, completed Initialization or Inception, and a preselected technical solution are not entry requirements. Plan the foundation needed for greenfield work or a walking skeleton.

## Stage characteristics

| Characteristic | Summary |
| --- | --- |
| Inputs | The current unit definition, `design.md`, `quality.md`, relevant supporting files and completion records; passed constraints and requester instructions; available Project references, source, tests, and operational information; and retained plans or work when revising. Do not require Planning's own outputs before entry. |
| Lead agent | The `kepler-architect` role owns context investigation, technical-solution selection, task-graph authoring, and plan review. Lead role names describe responsibility; they do not authenticate a worker, select a model or topology, or add permission. |
| Outputs | **Authored artifacts:** required `plan.md` and `tasks-dag.json`, plus useful linked detail when needed. **CLI-owned evidence and records:** artifact and graph validation, self-review, requested external-review evidence, and requester decisions or whole-plan approval only when required. **Handoff:** the plan, graph, evidence, and coordination constraints for Implementation. |
| Gates | **Entry:** Functional Design and Quality Requirements are complete for current material, their outputs are available, and consequential choices have a requester decision path. **Advance:** both planning outputs are valid and consistent, task coverage and verification are feasible, blockers are resolved, self-review is complete, any requested external review is complete, and any required requester decisions or approval are recorded. Implementation and passing application checks are not required. File presence, a commit, process exit, or positive review alone does not complete the stage or authorize progression. |

## Inputs and boundaries

Use the explicit unit's `unit-of-work.md`, `design.md`, `quality.md`, linked supporting files, applicable stage records, requester instructions, Project references, project standards, source, tests, build configuration, and operational information when available. Distinguish observed facts, proposed mechanisms, and assumptions. Investigate uncertain capabilities and integration contracts before relying on them.

Planning selects the technical solution against current functional and quality obligations, records rationale for every planning decision, and creates the task graph. It does not change upstream obligations without authorized revision, implement production code, run planned application checks, dispatch workers, admit tasks, select admission baselines, accept Integration candidates, or perform delivery operations.

When this skill is loaded from the distributed complete Kepler package, use `../../templates/v3/construction/plan.md` relative to this installed `SKILL.md`; use `../../templates/v3/construction/supporting-document.md` only when linked supporting detail is needed. These paths identify same-generation package assets, not project-cwd or legacy global templates. If unavailable, report the package-resource blocker; preserve this stage's procedure, approval, and authoring boundaries.

## Procedure

1. Inspect state and start the current attempt:

   ```text
   kepler workflow construction stage show --unit <unit-id> --stage implementation-planning [--project <path>]
   kepler workflow construction stage start --unit <unit-id> --stage implementation-planning --request '<typed stage-input JSON>' [--project <path>]
   ```

   Respect Standard order and derived blockers. Retain the returned exact attempt ID. Starting Planning does not dispatch work. Resolve effort from the unit default and explicit stage override; do not set Activity effort. Recommend an adjustment with rationale and record a requester-selected change through `kepler audit record interaction --unit <unit-id> ...` using its accepted structured effort request. Prose does not change effort.
2. Explore the unit and relevant project material before authoring. Use `kepler-research` for uncertain capabilities or integration facts, and `kepler-grilling` for material trade-offs or unresolved decisions. Do not trust memory or an earlier plan over current source, accepted upstream requirements, and project standards. Do not edit production implementation.
3. Select a technical solution that satisfies functional behavior, all applicable quality requirements, and binding constraints. Compare materially viable alternatives against shared criteria when choice affects risk, compatibility, cost, or constraints. Identify relevant components, interfaces, data representations, integration mechanisms, existing patterns, compatibility, operation and deployment effects. Record in `plan.md` the rationale for every planning decision, including assumptions, risks, alternatives, and why the chosen approach fits. Do not make requester-owned functional or quality decisions. Report upstream conflicts and unresolved consequential choices to their owners.
4. Author or update unit-root `plan.md` and `tasks-dag.json`, preserving existing artifact IDs and original authors. For new Markdown artifacts, get attribution with `kepler git author [--project <path>]`, and IDs with `kepler uuid`; if Git name or email is missing, stop creation and report the missing value. Use `type: implementation-plan` and required sections Technical solution, Task graph context, Verification strategy, and Decisions and open questions. Link the graph from the plan. Keep graph structure authoritative in JSON; never duplicate task definitions or edges in Markdown. Put useful supporting analysis under `details/implementation-planning/` and link it from the relevant section.
5. Define tasks in `tasks-dag.json` under the accepted closed `kepler-task-dag` version 1 format. Preserve identities of surviving graph/tasks during revisions; use unique lowercase UUIDv4 task IDs and never reuse retired IDs. For each task specify a cohesive outcome, required inputs, outputs, observable acceptance conditions, applicable functional/quality obligations and technical decisions, guidance, verification method, and prerequisites. Add a dependency only when the task needs another task's integrated output to do its work or verify acceptance; explain why in the dependency reason. Do not infer edges from numbering, order, shared files, worker availability, or convenience. Put shared-file/resource coordination in task guidance, check setup/isolation in verification method, and blocking external availability in prerequisites. Reject missing/self/duplicate edges and cycles. Use the complete accepted field contract, example, schema, and identity rules in [references/task-graph.md](references/task-graph.md). That reference describes the format; it is not an executable validator. Run the existing Construction lint command.
6. Make coverage explicit. Map each applicable functional requirement and quality obligation to planned work or a justified unchanged-behavior reference. Include integration, compatibility, deployment preparation, and necessary verification. Plan unit tests for isolated behavior, integration tests for real collaborations, and E2E tests for critical complete workflows. Identify exact repository-native commands for typechecking, build, and tests in `plan.md` and each task's `verification.method`; identify expected results, environment/resources, isolation, and execution permissions. Include Code Generation's typecheck and modification-related tests; Validation's typecheck, build, full application suite and independent non-author feedback; Integration's typecheck, build, and full application suite against the combined candidate under the unit lock. Planning records future duties, not results or permission. Do not add a generic extra-check policy, arbitrary-command execution, status/progress fields, attempts, approvals, baselines, or check results to the graph or artifacts.
7. Resolve external prerequisites in the graph contract. For each, state whether absence blocks work or verification, when it must be available, and how to establish availability. If a task output creates a prerequisite, represent it as a dependency. Explain why nonblocking prerequisites do not prevent required work or verification. Future availability is not required to complete Planning. Do not make actual task readiness or admission decisions.
8. Validate the artifacts and graph:

   ```text
   kepler lint <plan.md> [supporting-file ...] --project <path>
   kepler workflow construction lint --unit <unit-id> [--project <path>]
   ```

   The first command performs shared metadata lint on explicit Markdown paths; the Construction command checks the canonical graph structure and read-only path/link rules. Correct findings without rewriting unrelated material. These checks do not assess semantic coverage, technical correctness, input relevance, dependency justification, or external availability.
9. Self-review both artifacts and supporting material against upstream obligations and the completion conditions: technical consistency and rationale for every choice; explicit graph identity/dependencies/prerequisites; task inputs, outputs, acceptance and verification; coverage; resource coordination; feasible checks; current inputs; and no unresolved consequential choices left to unauthorized workers. Record actual artifact validation, graph validation, and self-review evidence with `kepler audit record evidence --unit <unit-id> --stage implementation-planning --attempt <attempt-id> [--project <path>]`, using one accepted typed JSON object on stdin with opaque references, purposes, actual executor/result, and applicable material bindings. Keep source references unchanged.
10. External review occurs only when the requester asks; effort, risk, and complexity do not trigger it. Resolve its blocking findings and record the result when requested. Obtain requester decisions for consequential choices. Separate whole-plan approval applies only when an applicable authority rule or requester instruction requires it. If required, ask for explicit approval of identified material, commit repository output first, then record it through `kepler audit record approval --unit <unit-id> --stage implementation-planning --attempt <attempt-id> [--project <path>]` with the accepted typed request. A positive review, commit, or command success is not consent.
11. Answer the five-question Planning reopening questionnaire below against current plan, graph, and linked material. Report findings and a proposed revision boundary to the orchestrator; answers do not authorize reopening. If reopened by the orchestrator, keep histories and original bindings, revise only the authorized scope, and repeat relevant validation, semantic self-review, evidence, and applicable requester decisions/approval. Do not dispatch tasks or edit journals/projections directly.
12. Recheck current state with `kepler workflow construction stage show --unit <unit-id> --stage implementation-planning [--project <path>]`. Complete only when artifacts, evidence, decisions, any applicable approval, and handoff meet the owning contract, using `kepler workflow construction stage complete --unit <unit-id> --stage implementation-planning --attempt <attempt-id> --request '<typed completion JSON>' [--project <path>]` with the accepted completion request. A valid graph alone, an exit code, or an approval that no longer binds current material does not complete Planning.

## Reopening questionnaire

Evaluate each question against the current plan and its relevant inputs. Report each answer, evidence, uncertainty, and proposed boundary to the orchestrator.

1. Is a change to the selected technical solution, a technical contract, or a material implementation assumption necessary?
2. Does it change task outcomes, required outputs, acceptance conditions, or coverage of an upstream obligation?
3. Does it change a dependency, external prerequisite, or coordination constraint on which the plan relies?
4. Does it invalidate the planned verification approach, environment, or ability to run required checks?
5. Does it expose an unresolved consequential decision or invalidate a stage completion condition?

A Yes answer gives the orchestrator a reason to examine this stage as a possible revision boundary. All No answers identify no independent reason to reopen it for this finding, but do not exempt a downstream stage from a cascade authorized upstream. A Planning-only change does not reopen valid upstream stages. Report invalid Functional Design or Quality Requirements inputs so the orchestrator can identify an earlier boundary.

The stage agent reports findings and proposes a boundary; it does not authorize reopening or start a revision cascade. The orchestrator compares the finding with current evidence and decisions, then decides whether to continue, investigate, or authorize reopening from the earliest affected stage. It records that decision. After authorization, the orchestrator reopens the affected stage and every downstream stage within the selected scope. Previous completion does not establish completion for revised work. Satisfy Planning's conditions again after authorized reopening, including any applicable requester decision or approval.

These rules follow the accepted contracts at `docs/specs/v3/phases/construction/implementation-planning.md#reopening-questionnaire` and `docs/specs/v3/revision.md`; those paths identify source provenance and are not runtime dependencies.

## Handoff

Give Implementation the unit directory, `plan.md`, `tasks-dag.json`, current upstream documents and linked files, technical decisions and rationale, exact task IDs and definitions, dependencies and justified reasons, prerequisites and availability conditions, verification commands/environments, coordination constraints, current attempt, evidence and any applicable approval receipts. The orchestrator derives readiness and admissions from current integrated outputs. Do not send assignments, create task attempts, dispatch workers, or claim that checks passed.
