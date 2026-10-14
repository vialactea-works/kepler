# Critique: Remove Wayfinder's one-ticket-per-session gate — 2026-08-29

## Scope

Three propose artifacts (`proposal.md`, `requirements/wayfinder.md`, and `design.md`) were cross-referenced against `AGENTS.md`, the live `skills/hamilton-wayfinder/SKILL.md`, `.hamilton/specs/wayfinder.md`, `.hamilton/specs/glossary.md`, `.hamilton/specs/ticket-resolution.md`, `docs/skills.md`, the ticket template, the research procedure, and the source decisions in Wayfinder tickets 01 and 04. Every named repository path exists. The artifacts cite no TypeScript type, function, API signature, schema, or code example, so code-reference grounding was limited appropriately to the Markdown contracts they actually change. There is no Route unit provenance and no removed capability or code surface to clean up.

Verdict: changes-requested — the central batch flow has contradictory eligibility timing, and two committed decision sources would remain inconsistent with the new contract.

## Findings

1. **[Critical] Batch eligibility has two incompatible evaluation points**
   - Where: `requirements/wayfinder.md:13,33-36`; `design.md:37,43,75-78,87`
   - Problem: The design says an explicit batch is evaluated at claim time and each requested ticket is reevaluated immediately before claim, which permits ticket 02 to run after earlier authorized ticket 01 resolves its blocker. The same design also says tickets newly unblocked by a resolution wait for a later explicit request, and its blocked-ticket row says a blocked requested ticket is not started. The requirements likewise say blocked requested tickets SHALL not be started without specifying whether that judgment is made at request time or claim time. For an authorized batch `[01, 02]` where `02` is initially blocked by `01`, a planner can implement either opposite behavior. This is the change's central control flow, so the ambiguity blocks planning under logical consistency and explicit edge handling.
   - Fix: Apply the author's validated claim-time rule throughout: a requested batch member remains authorized while waiting on earlier authorized work; reevaluate it when its frontier/file-order turn is reached; start it if all blockers are then resolved; skip and report it only if it is still ineligible at that point. Qualify the “newly unblocked tickets wait” rule to tickets outside the already authorized set, and add the dependent-batch scenario to the requirements so the chosen behavior is directly verifiable.

2. **[Significant] The superseded one-ticket/session definition is explicitly excluded from scope**
   - Where: `proposal.md:24-29,51-53`; `design.md:47-51,111`; `.hamilton/specs/glossary.md:28-33`; `.hamilton/maps/hamilton-wayfinder/tickets/01-map-artifact-layout.md:66-71`
   - Problem: The canonical glossary still defines one ticket file as one agent session's working target, and the source decision in ticket 01 says a session opens exactly that one file. Those statements encode the gate this change removes, yet the proposal and design say no persisted map artifact changes and deliberately limit consistency work to the skill, `wayfinder` spec, and docs summary. Because the glossary is the committed ubiquitous-language source and links ticket 01 as authority, leaving both untouched would preserve a current-looking contradiction and violate semantic coherence.
   - Fix: Expand the proposal, impact, architecture, verification, and constraints to include `.hamilton/specs/glossary.md` and ticket 01. Preserve the settled file-per-ticket layout, stable numbering, and reading-order rationale, but replace the one-file/one-session claim with ticket-sized, explicitly authorized working-target language. Mark the old ticket-01 statement superseded using its `## Outdated decisions` convention. Per the author's validated choice and the repository's established glossary precedent, no new behavioral capability delta is required.

3. **[Significant] Claiming's effect on the frontier remains contradictory at the decision source**
   - Where: `.hamilton/specs/wayfinder.md:46`; `.hamilton/maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md:65-70,95-100`; `skills/hamilton-wayfinder/SKILL.md:88,92`; `requirements/wayfinder.md:13,28-31`; `design.md:108`
   - Problem: The new requirements and design correctly preserve the live skill's rule that a claimed ticket is outside the frontier and cannot be started by another request. The canonical `wayfinder` spec and its linked source ticket 04 still state the opposite: claiming does not affect frontier calculation. Finish-work would therefore fold the new authorization behavior into a spec whose mechanics section contradicts the eligibility rule it depends on. The distinction between “unresolved” and the literal `status: open` value does not cure the explicit “does not affect frontier” assertion.
   - Fix: Preserve the author's validated current rule: `status: claimed` removes a ticket from the frontier while leaving it unresolved. Expand the consistency scope to correct `.hamilton/specs/wayfinder.md` and mark ticket 04's old frontier statement superseded. Keep the existing frontmatter values, claiming signal, collision behavior, and `CONTRIBUTING.md` mechanics table unchanged; this is a truth-alignment repair, not a mechanics redesign.

## Quality Lens

| Principle | Verdict | Notes |
| --- | --- | --- |
| Single responsibility (cohesion) | ✅ | The proposed skill, delta, canonical-spec, and summary roles are individually clear; the findings concern omitted truth surfaces, not mixed component responsibilities. |
| Low coupling / clear boundaries | ⚠️ (→ finding 2) | The design draws the maintained-contract boundary too narrowly and leaves the canonical vocabulary plus its source decision outside the consistency pass. |
| Dependency inversion & testable seams | ✅ | No runtime dependency is introduced; the contract is verifiable through named scenarios and static source comparisons once finding 1 is resolved. |
| DRY / single source of truth | ⚠️ (→ findings 2, 3) | The live skill, canonical specs, glossary, and source tickets currently carry divergent truths for session scope and claimed-ticket eligibility. |
| Right-sized abstraction (YAGNI) | ✅ | Rejecting a helper, request schema, persisted authorization field, and CLI surface is proportionate for this tool-agnostic interaction rule. |
| Intention-revealing names | ✅ | `authorization`, `authorized set`, `frontier`, `claim`, and `ticket` match the repository's domain language. |
| Explicit error and edge handling | ❌ (→ finding 1) | Unknown, claimed, resolved, and blocked tickets are enumerated, but the dependent-batch edge case has two incompatible outcomes. |
| Complexity budget | ✅ | The contract-only approach is the simplest viable structure; the required fixes align existing prose rather than adding machinery. |

## Summary

| Severity | Count | Items |
| --- | --- | --- |
| Critical | 1 | 1 |
| Significant | 2 | 2, 3 |
| Minor | 0 | — |

**Recommendation:** Do not proceed to `hamilton-plan`. Revise all three validated findings through `hamilton-propose`, then return to `hamilton-critique`. Finding 1 is the direct gate blocker; findings 2 and 3 must also be corrected before approval because they leave committed sources of truth contradicting the behavior the plan would implement.
