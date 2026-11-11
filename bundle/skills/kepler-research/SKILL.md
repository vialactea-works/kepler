---
name: kepler-research
description: Investigate uncertain facts in source code and primary references, returning sourced findings at the caller's supporting-file path.
---

# Research

## When to Use

Use when a Construction stage or Activity needs an uncertain implementation fact, external capability, integration contract, operating condition, or referenced requirement checked against trustworthy sources. The caller owns its stage, question, destination, exit condition, and evidence.

## Inputs

Require the caller's concrete research question, its decision relevance, applicable stage/Activity and unit scope, caller-owned output path (if authoring), and exit condition. Read caller-provided files and repository context first. If authoring is requested but no output path is supplied, ask before writing. Do not use legacy map/research/ticket/route paths, old glossary paths, or their lint commands. Do not introduce a new research agent role or require subagent dispatch.

## Procedure

1. Break the question into factual claims that could affect the caller's decision. Identify what evidence would resolve each claim and the source that owns it. Look up facts in the repository before asking for them.
2. Prefer primary sources: current source code, accepted project specifications, official API/library documentation, first-party service documentation, standards, or direct behavior observed through the relevant interface. For external versioned facts, verify the version/date applies to the caller's dependency or target. Use secondary sources only as leads and label them as such.
3. For repository facts, cite exact repository-relative file and symbol/section, and the relevant revision when it affects applicability. For external sources, cite canonical title, URL, publisher, relevant heading/passage, and access date where useful. Retain exact statements or concise evidence sufficient to trace the conclusion. Do not cite search snippets when the primary page can be inspected.
4. Separate source statements, observed behavior, inference, and unresolved uncertainty. Record a finding only to the degree its evidence supports it. If authoritative sources disagree, identify the disagreement and scope rather than choosing silently. If no source establishes a fact, state that it remains unknown. Research recommends no product decision, technical solution, or requester approval.
5. If the caller asks for sourced findings in a document, write them only at the supplied supporting-file path and in the caller's format. For a new author-bearing v3 Markdown supporting artifact, use `type: supporting-document`, obtain Git attribution with `kepler git author [--project <path>]`, and generate its ID with `kepler uuid`; stop if either effective identity value is absent. Preserve existing author and artifact identity on updates. Do not create empty files, a second source registry, or unlinked material.
6. Validate explicitly authored Markdown using `kepler lint <path> [--project <path>]`. This checks shared metadata, not factual correctness. Provide the actual findings and sources to the owning skill; only that skill records required stage evidence/approval with CLI-owned operations. Do not edit journals or projections or create a separate Activity/evidence record.
7. Stop when the caller's exit condition is met. If evidence is insufficient, return the precise missing source/observation and its decision impact; do not keep researching adjacent questions.

## Handoff

Return a concise answer for each claim, supporting evidence and primary-source citation, the source version/date and applicability, any inference or uncertainty, the caller-owned file path and validation result if authored, and whether its exit condition is met. Preserve source bindings and link the detail from the caller's required artifact section when requested. Do not claim that research itself changes workflow state, proves implementation compliance, or authorizes a decision.