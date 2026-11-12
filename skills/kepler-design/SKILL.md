---
name: kepler-design
description: Run Functional Design for a Construction Unit of Work under its accepted v3 contract.
---

# Functional Design

The developer asks you to define this unit's behavior, review the committed material with them, and request explicit approval before completing this stage. Read the [packaged agent operations](../kepler-mission-startup/references/agent-operations.md) and its complete request examples before acting. You execute Kepler commands and track attempt/evidence IDs; do not ask the developer to author JSON or run CLI commands. Start only an eligible attempt or continue the same safe unended attempt. Report actual artifacts, checkpoint, evidence, blockers, and the next prompt: “Use kepler-quality for this unit; show me the quality requirements for approval.” Do not start Quality yourself.

## When to Use

Use when Functional Design is the current Standard stage for a selected Unit of Work. Begin from the request and available context; completed Inception, application code, a complete domain model, and pre-authored unit documents are not entry requirements.

## Stage characteristics

| Characteristic | Summary |
| --- | --- |
| Inputs | The request, Unit of Work identity and intended outcome, requester instructions, available Project information, and existing source or tests when available. Inception outputs are optional; do not require Functional Design's own outputs before entry. |
| Lead agent | The `kepler-architect` role owns investigation, requester discussion, design consistency, and self-review. Lead role names describe responsibility; they do not authenticate a worker, select a model or topology, or add permission. |
| Outputs | **Authored artifacts:** required `unit-of-work.md` and `design.md`, with useful supporting detail when needed. **CLI-owned evidence and records:** self-review, required requester approval, and any requested external-review result. **Handoff:** current documents and relevant questions for Quality Requirements. |
| Gates | **Entry:** the request states an outcome that fits one Unit of Work, enough context exists to investigate, and the requester can resolve consequential questions. **Advance:** required documents and sections are complete and consistent, self-review is done, material choices are resolved, and requester approval is recorded; external review is required only when requested. File presence, a commit, process exit, or positive review alone does not complete the stage or authorize progression. |

When this skill is loaded from the distributed complete Kepler package, use `../../templates/v3/construction/unit-of-work.md` and `../../templates/v3/construction/design.md` relative to this installed `SKILL.md`; use `../../templates/v3/construction/supporting-document.md` only when linked supporting detail is needed. These paths identify same-generation package assets, not project-cwd or legacy global templates. If unavailable, report the package-resource blocker; preserve this stage's procedure, approval, and authoring boundaries.

## Procedure

1. Resolve the selected project and unit explicitly. Use `kepler workflow construction stage show --unit <unit-id> --stage functional-design [--project <path>]` to inspect derived state, current attempt, effective effort, and relevant evidence. Do not infer an active unit or stage from a branch, directory name, or previous conversation. If the stage is not ready to start, report its blockers and stop; do not bypass Standard order.
2. Start only the authorized attempt with `kepler workflow construction stage start --unit <unit-id> --stage functional-design --request '<typed stage-input JSON>' [--project <path>]`. Starting a stage creates its attempt but does not dispatch an agent. Use the returned exact attempt ID in every later stage-scoped command. Resolve effort from the unit default and explicit stage override; Activities inherit stage effort. Recommend an adjustment with rationale and record it only after the requester selects it, using `kepler audit record interaction --unit <unit-id> ...` with the accepted structured effort-selection request. Do not infer selection from prose.
3. Investigate the request, unit context, relevant Project references, source and tests when available. Use `kepler-research` and `kepler-domain-modelling` with caller-owned paths when useful. Distinguish observed facts, proposed behavior, and assumptions. Ask the requester to resolve consequential functional choices. Do not invent current behavior or hide a missing decision in an assumption.
4. Create or update the unit-root `unit-of-work.md` and `design.md` using valid v3 metadata. Preserve existing artifact UUIDs and original `author` attribution. For a new artifact, read identity with `kepler git author [--project <path>]` and create an ID with `kepler uuid`; if Git name or email is absent, stop artifact creation and report the missing key. Keep required content in the prescribed Purpose, Scope, Context and Domain behavior, Domain model, Boundaries and interactions, Design decisions and open questions sections. Put useful linked detail only under `details/functional-design/` and do not create empty or unlinked files.
5. State observable outcomes and acceptance criteria, including relevant failures and boundaries. Define domain concepts, rules, responsibilities, and functional inputs, outputs, errors, and compatibility obligations. Record alternatives and rationale for functional decisions. Pass quality concerns, operational constraints, and technical questions to their responsible later stages. Do not choose architecture, libraries, storage, or implementation tasks; Planning owns technical solution selection.
6. Validate the current authored Markdown with `kepler lint <unit-of-work.md> <design.md> [supporting-file ...] --project <path>`. Correct findings without changing unsupported artifacts. Perform semantic self-review against the unit request and contract: required content, acceptance criteria, consistency, blocking questions, and Quality handoff. External review occurs only if requested.
7. Commit repository output before recording approval. Record validation and self-review results through `kepler audit record evidence --unit <unit-id> --stage functional-design --attempt <attempt-id> [--project <path>]` using one typed JSON request on stdin with applicable reviewed inputs and actual results. If external review was requested, record its result too. Ask the requester to explicitly approve the current material; then record that decision with `kepler audit record approval --unit <unit-id> --stage functional-design --attempt <attempt-id> [--project <path>]` and the accepted typed JSON request. Do not infer consent from a commit, positive review, or command success. Approval binds the reviewed material and does not authorize implementation.
8. Before completion, answer the reopening questionnaire in the Functional Design contract against the current files and linked detail. Report findings and a proposed revision boundary to the orchestrator. Answers do not authorize reopening. If authorized reopening changes this material, repeat validation, self-review, evidence, and explicit requester approval for the revised material; preserve history and original bindings.
9. Recheck stage state with `kepler workflow construction stage show --unit <unit-id> --stage functional-design [--project <path>]`. Complete only when the owning stage conditions hold and required evidence and approval apply to current material, using `kepler workflow construction stage complete --unit <unit-id> --stage functional-design --attempt <attempt-id> --request '<typed completion JSON>' [--project <path>]` with its accepted completion request. A successful process exit alone is not proof of completion.

## Handoff

Give the orchestrator the unit directory, current `unit-of-work.md`, `design.md`, linked supporting files, relevant Project references, known constraints, and unresolved nonblocking questions. Identify known quality concerns and observability needs for Quality Requirements. State the current attempt and CLI evidence/approval receipts. Do not invoke or start the next stage yourself.

## Reopening questionnaire

Evaluate each question against the agreed Functional Design, including linked supporting files. Report each answer, evidence, uncertainty, and proposed revision boundary to the orchestrator.

1. Is a change to the intended outcome, scope, or exclusions of the Unit of Work necessary?
2. Is a change to domain behavior, acceptance criteria, failure behavior, or boundary conditions necessary?
3. Is a change to the meaning of domain terms, concepts, relationships, business rules, invariants, states, or responsibilities necessary?
4. Is a change to interaction-boundary ownership or the functional contract, its inputs, outputs, errors, or compatibility obligations necessary?
5. Does it invalidate an assumption or decision that the agreed functional design depends on?
6. Does it expose an unresolved required functional decision or show that a Functional Design completion condition is no longer met?

A Yes answer gives the orchestrator a reason to examine this stage as a possible revision boundary. All No answers identify no independent reason to reopen it for this finding, but do not exempt a downstream stage from a cascade authorized upstream. A later-stage-only change does not reopen valid Functional Design while its contract and outputs remain valid.

The stage agent reports findings and proposes a boundary; it does not authorize reopening or start a revision cascade. The orchestrator compares the finding with current evidence and decisions, then decides whether to continue, investigate, or authorize reopening from the earliest affected stage. It records that decision. After authorization, the orchestrator reopens the affected stage and every downstream stage within the selected scope. Previous completion does not establish completion for revised work.

After authorized reopening, repeat Functional Design self-review and obtain the requester's explicit approval of the revised design through CLI-owned JSON journal events. Only the requester can request external review. These rules follow the accepted contracts at `docs/specs/v3/phases/construction/functional-design.md#reopening-questionnaire` and `docs/specs/v3/revision.md`; those paths identify source provenance and are not runtime dependencies.