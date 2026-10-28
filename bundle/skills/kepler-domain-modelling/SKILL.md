---
name: kepler-domain-modelling
description: Clarify domain language, rules, invariants, responsibilities, and boundaries using the caller's Construction scope and document paths.
---

# Domain Modelling

## When to Use

Use when a caller needs domain terminology, a behavioral model, rules, invariants, responsibilities, or boundaries clarified for a Unit of Work. This skill supports the caller's stage; it does not create a separate model-authority artifact or workflow role.

## Inputs

Require the caller's unit/stage context, the question or model area, relevant document paths, and whether to analyze only or author/update content. Use the caller's supplied destination; if it is absent and authorship is required, ask for the destination before writing. Read the current unit and relevant design/quality/plan artifacts and their linked detail. Inspect source or tests when needed to distinguish current implementation facts from proposed behavior. Do not use legacy glossary/map/route/ticket paths or their validators.

## Procedure

1. Establish the relevant bounded context and its ownership boundary from the caller's contracts and project evidence. Keep one term's context-specific meaning separate from meanings in other contexts. Identify integrations and translations between contexts only when they matter to the caller's question.
2. Extract candidate domain terms, relationships, state transitions, business rules, invariants, responsibilities, and functional interactions. Include only concepts needed to explain the behavior. A Unit of Work, bounded context, aggregate, domain event, or domain service is not mandatory vocabulary; do not invent elements to fill a model.
3. Compare current terms with the caller's established language and source of truth. Cite the relevant artifact section or source-code location. Distinguish observed behavior, existing contract, proposal, assumption, unresolved question, and requester-confirmed decision. If a term is ambiguous or conflicts with an accepted contract, state the conflict and ask the caller/requester to resolve it; do not silently rename or supersede established language.
4. Stress-test the model with concrete normal, failure, and boundary scenarios. Check who owns each rule/data item, what changes state, and what an interaction promises at its boundary. Separate domain obligations from implementation mechanisms. Record alternatives only when the caller's decision contract asks for them.
5. For analysis-only use, return the model and sources without writing. For requested authorship, update only the caller-owned destination and relevant linked files; do not create a second glossary or write outside the supplied scope. Preserve existing artifact IDs and author metadata. For a new author-bearing v3 Markdown document, obtain values using `kepler git author [--project <path>]` and `kepler uuid`; stop if either Git identity value is absent. Follow the owning artifact's type, required sections, and metadata contract.
6. Validate only the authored v3 Markdown files at their explicit paths with `kepler lint <path>... [--project <path>]`. Resolve findings within the authorized scope or report them. Do not make lint success evidence of semantic correctness. Where the stage requires a check/review record, provide the caller the actual result so the owning skill can record it through CLI-owned audit operations.
7. Do not change approved behavior, quality targets, technical solution, scope, or authority in a supporting model. Report upstream consequences and a proposed revision boundary to the caller; only the orchestrator/contract owner authorizes reopening.

## Handoff

Return the caller's destination, bounded-context scope, canonical terms and definitions, rules/invariants/relationships/responsibilities, concrete scenarios considered, source locations, and distinctions between observed facts, proposals, assumptions, and unresolved decisions. State whether files changed, the exact lint result if run, and any proposed upstream question. Do not claim approval, completion, or authority to revise.