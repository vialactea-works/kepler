# Revision

[Workflow phase index](README.md)

## Purpose

Define the shared revision rules for the stages of one Unit of Work. These rules apply across stages, not only to Functional Design.

Use the stage order defined by the phase contract. See the [Construction stage outline](phase_construction/README.md#stage-outline).

Apply execution-state changes through the `kepler` CLI. Reopening, attempts, current completion, and approval history belong in structured JSON under the shared [CLI infrastructure contract](runtime.md), not artifact frontmatter or Markdown status fields.

## Rules

### Revision boundary

- Start at the earliest stage whose contract or output must change, or whose completion is no longer valid.
- Reopen that stage and every downstream stage. Their previous completion does not establish completion for the revised work.
- Execute the reopened stages again, in order. Do not skip a downstream stage because its outputs appear unaffected.
- Keep upstream stages complete while their contracts and outputs remain valid. If a finding also affects an upstream stage, move the revision boundary to that earlier stage.

Upstream stages occur before the revision boundary. Downstream stages occur after it. Depth does not change the revision boundary or remove the required cascade.

### Artifacts and evidence

- Reconsider every artifact from the reopened stage and every downstream stage against the revised inputs.
- Update or regenerate an artifact when needed. Existing content can remain when it is still valid, but its stage must establish that validity again.
- Preserve previous decisions, artifacts, and approvals as history. Do not present historical completion or approval as evidence that the revised stage is complete.
- Satisfy each stage's completion conditions again. Its contract determines the required checks, review, and approval.
- Preserve unaffected upstream artifacts and approvals.

## Stage reopening questionnaires

Each stage contract must define a reopening questionnaire. Its questions identify findings that require a change to that stage's contract or outputs, or invalidate its completion. This questionnaire supplies stage-specific rules to the shared revision procedure. Do not define a separate revision procedure for each stage.

Evaluate the questionnaires in stage order to identify the earliest affected stage. Use the findings and existing artifacts to answer the questions. Resolve unclear answers through investigation or requester decisions before selecting the boundary.

- A Yes answer identifies a reason to reopen that stage.
- All No answers identify no independent reason to reopen that stage for the finding.
- All No answers do not exempt a downstream stage from a cascade that starts upstream.

A questionnaire identifies the revision boundary. It does not replace the stage's completion conditions, review rules, or approval rules.

## Revision procedure

1. **Identify the boundary.** Use the stage reopening questionnaires. Record the finding, the required change, and the earliest affected stage.
2. **Reopen the stages.** Treat completion of that stage and every downstream stage as no longer current. Preserve the previous work as history.
3. **Revise the current stage.** Reconsider all its artifacts against its current inputs. Update or confirm each artifact.
4. **Complete the current stage.** Execute the stage and satisfy its completion conditions. Obtain and record approval when its contract requires it.
5. **Continue downstream.** Repeat the stage execution and artifact checks for every following stage, in order.

If a finding moves the revision boundary upstream, apply this procedure from the earlier stage.

## Construction examples

| Change | Revision boundary | Required cascade |
| --- | --- | --- |
| Required domain behavior changes. | Functional Design. | Every subsequent stage through Deliver. |
| A quality requirement changes while functional behavior remains valid. | Non-functional Requirements. | Implementation Planning and every subsequent stage through Deliver. |
| The implementation approach changes while functional and quality requirements remain valid. | Implementation Planning. | Code Generation and every subsequent stage through Deliver. |

## Decisions still required

The shared [CLI infrastructure contract](runtime.md) must define attempt and revision identifiers, approved-version references, and JSON audit history formats. How to preserve each revision's actual outputs remains a separate decision; an audit event or fingerprint is not an output snapshot.

Rules for editorial corrections and recovery from interrupted work require separate decisions. This document records the shared cascade rule and questionnaire mechanism. It does not approve all earlier revision and recovery proposals.
