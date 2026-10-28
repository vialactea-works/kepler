---
name: kepler-grilling
description: Run a focused, requester-owned discussion while preserving the calling skill's context, decision authority, and exit condition.
---

# Focused Requester Discussion

## When to Use

Use when a caller asks you to stress-test a plan, decision, finding, trade-off, or open question, or when the caller explicitly invokes this supporting skill. The calling stage or Activity owns its artifacts, decisions, completion rules, and handoff.

## Inputs

Require the caller's subject/context and a concrete exit condition (for example, clarify functional intent, resolve a material target choice, or validate a proposed finding). If either is missing, ask what to examine and what outcome ends the discussion. Accept caller-supplied artifact paths and scope. Do not infer the stage, reopen an artifact, or replace the caller's exit condition with your own process.

## Procedure

1. Separate facts that can be looked up from choices that belong to the requester. Inspect source documents, code, tests, project standards, or provided research for discoverable facts. Do not ask the requester to repeat information available in the repository or references.
2. Identify each unresolved decision that could affect the caller's exit condition. Ask one focused question at a time. Offer a recommendation and concise reason where a recommendation helps; distinguish it from the requester's authority.
3. Evaluate each answer. If it creates a concrete contradiction, failure case, material cost, or conflict with a recorded decision, raise one specific objection. If the requester reaffirms or marks a choice final, accept it, record any remaining reservation briefly, and do not reopen the same point without new evidence.
4. Keep facts, assumptions, recommendation, requester decision, and unresolved issue distinct. Do not present a proposal as an existing fact. Do not decide product behavior, quality targets, approval, permission, revision scope, or completion on the requester's behalf.
5. Record each answer only where the caller's contract requires it and at the path the caller supplied. If a stage requires CLI-owned recording, use its typed interaction operation, for example `kepler audit record interaction --unit <unit-id> --stage <stage> --attempt <attempt-id> [--project <path>]` with the accepted JSON request on stdin. Faithfully record actual requester statements; an interaction record does not itself grant approval or change authority. Do not create tickets, maps, routes, a transcript, or a separate decision artifact for convenience.
6. Stop as soon as the caller's exit condition holds. If it cannot hold without an unresolved requester choice or unavailable fact, identify that exact item and return control rather than continuing an unrelated interrogation.

## Handoff

Return the caller's subject and scope, facts checked with sources, questions and answers, any recommendation or reservation, unresolved choices, and whether the caller's exit condition is met. Name the supplied destination or report that no path was supplied. The caller decides whether to update an artifact, record evidence, request approval, or propose a revision.