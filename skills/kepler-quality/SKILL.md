---
name: kepler-quality
description: Define and review applicable quality requirements for a Construction Unit of Work under its accepted v3 contract.
---

# Quality Requirements

## When to Use

Use when Quality Requirements is the current Standard stage for a unit whose Functional Design is complete under its contract. Existing application code, production measurements, a complete `quality.md`, or Inception are not prerequisites.

## Procedure

1. Inspect the explicit unit with `kepler workflow construction stage show --unit <unit-id> --stage quality-requirements [--project <path>]`. Confirm the Standard transition is available and review current attempt, effective effort, and evidence. Do not infer scope from an active directory or select a different unit. If blocked, report the derived blockers rather than bypassing them.
2. Start the authorized attempt with `kepler workflow construction stage start --unit <unit-id> --stage quality-requirements --request '<typed stage-input JSON>' [--project <path>]` and retain the returned exact attempt ID. Starting does not dispatch work. Apply unit-default effort unless an explicit Quality override exists. Recommend effort changes with rationale; the requester chooses, and a selected change is recorded with `kepler audit record interaction --unit <unit-id> ...` using the accepted structured selection, not prose.
3. Read the current `unit-of-work.md`, accepted `design.md`, relevant linked files, known Quality handoff, requester instructions, Project references, and available source/operational information. Investigate missing or conflicting facts with `kepler-research`. Keep existing guarantees separate from proposed targets and assumptions. Do not require existing code, benchmarks, deployment, or tests.
4. Review each of the eight categories: Performance, Availability, Security, Accessibility, Compatibility, Operability, Observability, and Maintainability. State whether each applies to this unit and briefly explain categories with no relevant requirement. For each applicable requirement, identify scope, conditions, measurable or observable target, and objective acceptance condition. Resolve material targets, constraints, and trade-offs with the requester. Never invent a measurement, claim an unimplemented target is achieved, or select the architecture, library, storage, deployment mechanism, or implementation task.
5. Author or update unit-root `quality.md` (`type: non-functional-requirements`) with the required Quality requirements, Constraints and dependencies, and Decisions and open questions sections. Preserve its UUID and original author. For new artifacts, use `kepler git author [--project <path>]` and `kepler uuid`; stop if either effective Git identity value is absent. Put only useful, linked supporting detail under `details/quality-requirements/`; don't create empty files. Keep functional changes in Functional Design and report them to the orchestrator through the revision procedure.
6. Validate `quality.md` and linked Markdown with `kepler lint <quality.md> [supporting-file ...] --project <path>`. Self-review category applicability, requirement scope, conditions, acceptance criteria, consistency with the accepted Functional Design, unresolved material choices, and handoff completeness. External review occurs only if the requester asks. If requested, resolve blocking findings and retain the review result.
7. Record actual validation and self-review results using `kepler audit record evidence --unit <unit-id> --stage quality-requirements --attempt <attempt-id> [--project <path>]` with the accepted typed JSON request on stdin, bound to current material and relevant inputs. Commit repository output before recording requester approval. Ask the requester to explicitly approve current targets, constraints, material assumptions, and trade-offs, then record the decision with `kepler audit record approval --unit <unit-id> --stage quality-requirements --attempt <attempt-id> [--project <path>]` and its accepted typed JSON request. A commit, positive review, or successful command is not consent. Approval permits progression to Planning; it does not select a solution or authorize implementation.
8. Answer the five-question reopening questionnaire in the Quality Requirements contract. Report findings and a proposed boundary to the orchestrator; questionnaire answers do not authorize reopening. A functional obligation change belongs upstream. Following authorized reopening, repeat applicable artifact validation, self-review, evidence, and requester approval against revised current material; keep historical records and bindings intact.
9. Confirm state with `kepler workflow construction stage show --unit <unit-id> --stage quality-requirements [--project <path>]`. Complete only when current artifacts, evidence, any requested review, requester approval, and handoff satisfy the owning contract, through `kepler workflow construction stage complete --unit <unit-id> --stage quality-requirements --attempt <attempt-id> --request '<typed completion JSON>' [--project <path>]` using the accepted completion request. A successful exit alone does not establish completion.

## Handoff

Give the orchestrator and Implementation Planning the unit directory, accepted `unit-of-work.md` and `design.md`, current `quality.md`, linked supporting files, applicability decisions, targets and conditions, binding constraints, assumptions, quality trade-offs, and open questions. Identify the current attempt and evidence/approval receipts. Do not dispatch work or select the technical solution.

## Reopening questionnaire

Evaluate each question against the current quality requirements and relevant linked files. Report each answer, findings, evidence, uncertainty, and proposed boundary to the orchestrator.

1. Does the finding change which quality requirements apply to the unit?
2. Does it change a target, constraint, acceptance condition, or the material covered?
3. Does it change relevant operating conditions, supported environments, dependencies, or an existing guarantee?
4. Does it invalidate an assumption or quality trade-off on which the requirements depend?
5. Does it expose a material quality question that is unresolved or invalidate a completion condition?

A Yes answer gives the orchestrator a reason to examine this stage as a possible revision boundary. All No answers identify no independent reason to reopen it for this finding, but do not exempt a downstream stage from a cascade authorized upstream. A required functional-behavior change can move the boundary to Functional Design; report it without revising functional behavior here.

The stage agent reports findings and proposes a boundary; it does not authorize reopening or start a revision cascade. The orchestrator compares the finding with current evidence and decisions, then decides whether to continue, investigate, or authorize reopening from the earliest affected stage. It records that decision. After authorization, the orchestrator reopens the affected stage and every downstream stage within the selected scope. Previous completion does not establish completion for revised work.

After authorized reopening, satisfy this stage's completion conditions again, including self-review and the requester's explicit approval of the revised quality requirements. These rules follow the accepted contracts at `docs/specs/v3/phases/construction/quality-requirements.md#reopening-questionnaire` and `docs/specs/v3/revision.md`; those paths identify source provenance and are not runtime dependencies.