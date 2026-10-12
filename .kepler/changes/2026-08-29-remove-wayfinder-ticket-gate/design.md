# Design: Remove Wayfinder's one-ticket-per-session gate

## Context

The Wayfinder skill is a user-invoked Markdown contract for charting and working file-native decision maps. Its current work loop loads an existing map, automatically chooses the first frontier ticket, and limits non-research resolution to one ticket per session. The recent same-session rule correctly makes claiming the start of resolution, but the session ceiling and implicit first-ticket selection conflict with the intended interaction: a user should explicitly authorize ticket work, and one request may authorize several ticket-sized targets.

The first critique identified three defects in the original design and the author validated each correction. First, batch eligibility is evaluated at claim time, so a member blocked at request time may run after an earlier authorized member resolves its blockers. Second, the canonical glossary and source ticket 01 must stop defining one ticket file as one whole agent session while preserving file-per-ticket layout. Third, the live skill's current truth wins for claiming: `claimed` leaves a ticket unresolved but removes it from the frontier, requiring correction in the canonical Wayfinder spec and source ticket 04.

The behavior is carried primarily by `skills/hamilton-wayfinder/SKILL.md`, while `.hamilton/specs/wayfinder.md` is the durable capability truth and `docs/skills.md` is the user-facing summary. `.hamilton/specs/glossary.md` owns committed Wayfinder vocabulary, and resolved tickets 01 and 04 remain linked as the decision sources for ticket layout and frontier mechanics. The file-native artifact format, frontmatter values, templates, resolving procedures, and task ledger are not changed.

## Goals / Non-Goals

**Goals**

- Make explicit user authorization the only gate that starts ticket work.
- Permit one explicit request to authorize one named ticket, the next frontier ticket, or a fixed named batch.
- Order named batches by ticket file order and reevaluate each member only at its turn, allowing earlier authorized work to clear a later member's blockers.
- Start a member only when it is open, unblocked, and unclaimed at its claim-time turn; report and skip a member still ineligible without substitution.
- Preserve claim-before-resolution, same-session resolution, typed-skill dispatch, answer capture, map gists, consistency checks, and research continuation.
- Stop after the fixed authorization set instead of automatically claiming an unrequested frontier ticket.
- Align the skill, canonical Wayfinder spec, canonical glossary, docs summary, and source decision tickets with the same session-scope and claimed-frontier truth.

**Non-Goals**

- No change to the map or ticket file format, frontmatter fields or values, ticket types, `blocked_by` meaning, collision behavior, map lifecycle, route generation, or resolving procedures.
- No helper script, CLI command, request schema, persisted authorization state, tracker integration, migration, or runtime enforcement.
- No changes to templates, `CONTRIBUTING.md`, TypeScript, dependencies, or task-ledger data.
- No new glossary behavioral capability or `requirements/glossary.md`; the glossary edit corrects canonical reference content using the repository's established glossary precedent.

## Decisions

### Decision: Keep authorization as an interaction contract

- Choice: express authorization in `skills/hamilton-wayfinder/SKILL.md`, fold the same behavior into the `wayfinder` canonical spec through the requirements delta, and update the user-facing and decision-source prose that would otherwise contradict it. A user message is the authorization record for the current interaction; no map field or auxiliary state is added.
- Alternatives considered: a helper script or validator would need to understand natural-language user intent and would add state without a stable runtime event to validate; a structured request protocol or CLI would expand a user-invoked, tool-agnostic skill's public interface for a single interaction rule.
- Rationale: the requested behavior is about whether the user has asked the agent to begin. Normative prose is the smallest structure that preserves the portable contract. The accepted non-enforceability trade-off is recorded under Risks / Trade-offs and in the Quality Lens.

### Decision: Use a fixed authorization set with claim-time eligibility

- Choice: loading or invoking a map without a ticket request only orients and waits. A request may name one ticket, request the current next frontier ticket, or name several tickets. Resolve explicitly named identifiers first, reporting and excluding unknown names without substitution. The remaining named tickets become a fixed authorization set ordered by the map's ticket file order, the same ordering basis used by the frontier. Each member is evaluated once, immediately before its turn: start it if it then has `status: open` and all blockers resolved; otherwise report and skip it without substitution.
- Alternatives considered: request-time eligibility would permanently exclude a named dependent ticket even if earlier authorized work clears it; unrestricted auto-advance would let a request consume unrequested work; following incidental request order would make dependency behavior less deterministic; allowing an explicit request to bypass blockers would weaken established map safety.
- Rationale: claim-time evaluation implements the author's validated dependent-batch rule without making authorization dynamic. In the defining example, authorization `[01, 02]` stays fixed, ticket 01 resolves first in file order, and ticket 02—initially blocked only by 01—becomes eligible and starts at its later turn. If it remains blocked then, it is skipped.

### Decision: Stop at the authorization boundary

- Choice: after each authorized member reaches the existing resolution and recording steps, the session advances only to the next member of the fixed authorization set. When the set is exhausted, it stops. A ticket created or newly unblocked by a resolution may start in that session only if it was already named in the authorization set and has not yet reached its turn. Returned findings for a research ticket that was already authorized and dispatched remain eligible for the existing absorption flow because they complete prior work rather than start a new ticket.
- Alternatives considered: looping back to the full current frontier would preserve the unwanted auto-advance behavior; requiring a fresh request after every individual ticket would remove the benefit of explicit batches and recreate an artificial quota.
- Rationale: the user's request defines the session's scope while claim-time evaluation lets dependencies evolve inside that scope.

### Decision: Claimed means unresolved but outside the frontier

- Choice: preserve the live skill and glossary's current behavior: the frontier contains `status: open`, unblocked tickets in file order; setting `status: claimed` removes a ticket from the frontier and from start eligibility while leaving it unresolved and actively in hand. Correct the canonical Wayfinder spec and ticket 04 to this truth.
- Alternatives considered: retaining ticket 04's statement that claiming does not affect frontier calculation would allow an actively claimed ticket to be selected again and directly contradict both the live skill and the new authorization requirement; removing claiming would alter established collision signaling outside this change.
- Rationale: one eligibility definition must govern single requests and batches. This correction changes no frontmatter value or collision mechanism; it aligns the source decision with behavior already implemented in the authoritative skill.

### Decision: Repair the glossary and source tickets, preserving superseded decisions

- Choice: revise `.hamilton/specs/glossary.md` so a decision-ticket file is one ticket-sized working target, and a session opens each ticket it explicitly claims rather than being limited to one file. In ticket 01, retain file-per-ticket layout, numbering, stable identity, link legibility, and file-order rationale while moving the old one-file/one-session statement under `## Outdated decisions`. In ticket 04, retain claim signaling and collision behavior while moving the old “claiming does not affect frontier calculation” statement and matching consequence under `## Outdated decisions`. Each outdated block links to `../../../changes/2026-08-29-remove-wayfinder-ticket-gate/requirements/wayfinder.md` as the superseding contract.
- Alternatives considered: update only the canonical surfaces and leave source tickets apparently current; delete the old statements entirely; create a `glossary` capability delta for a reference-text correction.
- Rationale: the canonical glossary links ticket 01 as authority, and the canonical Wayfinder spec rests on ticket 04's mechanics decision. Updating current Answers while retaining the old text as explicitly outdated prevents re-litigation without falsifying history. The glossary is reference content rather than testable behavior, so a second capability delta would be ceremony without information.

### Decision: Change every contradictory contract surface and no unrelated one

- Choice: revise the Wayfinder skill's description, opening, work loop, examples, invariant, decisions, and process-flow diagram; update `docs/skills.md` where its summary says one at a time; update the glossary and source tickets described above; and use the `wayfinder` delta to update the canonical spec's Overview, Working behavior, Examples, Invariants, Decisions, and map-mechanics claim statement at finish-work. Leave the ticket template's “sized to a single agent session” hint unchanged because it describes ticket sizing, not a per-session count, and leave unrelated one-question-at-a-time and one-change-at-a-time language untouched.
- Alternatives considered: replace every repository occurrence of “one at a time,” which would alter unrelated concepts; update only the live skill, which would preserve contradictory durable truth.
- Rationale: the scope follows concepts, not text matching. Each changed source directly states the superseded session quota, implicit start, or frontier effect.

## Architecture & Components

| Unit | Responsibility | Interface | Depends on |
|---|---|---|---|
| `skills/hamilton-wayfinder/SKILL.md` | Normative working procedure: authorization, fixed-set ordering, claim-time eligibility, sequential resolution, and stop conditions | User-invoked `SKILL.md`; explicit request in the current conversation | File-native map artifacts and existing resolving skills |
| `.hamilton/changes/2026-08-29-remove-wayfinder-ticket-gate/requirements/wayfinder.md` | Change-side behavioral delta and conformance scenarios | Input to planning, review, and finish-work | Existing `.hamilton/specs/wayfinder.md` |
| `.hamilton/specs/wayfinder.md` | Durable capability truth for working behavior and frontier mechanics | Canonical prose updated by finish-work | The completed `wayfinder` delta and design decisions |
| `docs/skills.md` | Concise user-facing Wayfinder summary | Documentation entry point | `skills/hamilton-wayfinder/SKILL.md` as authoritative procedure |
| `.hamilton/specs/glossary.md` | Canonical definition of a decision ticket as a ticket-sized target rather than a session quota | Committed ubiquitous language | Current ticket 01 decision |
| `.hamilton/maps/hamilton-wayfinder/tickets/01-map-artifact-layout.md` | Source decision for file-per-ticket layout and target sizing | Current `## Answer` plus `## Outdated decisions` linked to this change | Superseding `requirements/wayfinder.md` |
| `.hamilton/maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md` | Source decision for claiming and its frontier effect | Current `## Answer` plus `## Outdated decisions` linked to this change | Superseding `requirements/wayfinder.md` |

The map remains the source of ticket state. Authorization remains ephemeral conversation scope. The design introduces no module, service, parser, mutable authorization data, or runtime dependency seam.

### Quality Lens

- Responsibility: the skill owns execution wording, the `wayfinder` spec owns durable behavior, the glossary owns vocabulary, each source ticket owns its decision history, and `docs/skills.md` owns concise orientation. The requirements delta owns only this change's behavioral obligations.
- Boundaries and dependencies: authorization refers to frontier eligibility rather than redefining frontmatter. Claim-time evaluation reads existing status and blockers at a named boundary; the current Answers in tickets 01 and 04 are corrected without changing mechanics or layout.
- DRY / single source of truth: the skill is the operational authority, the canonical spec and glossary are durable truth, and source tickets preserve rationale. Their different audiences require parallel prose, but the design explicitly updates every conflicting statement and retains old truth only under `## Outdated decisions`.
- Right-sizing: deliberately not added are a request schema, authorization metadata, helper script, CLI surface, enforcement hook, template change, or glossary capability. None is required to make this prose contract deterministic.
- Explicit edge handling: no request, unknown identifier, resolved member, claimed member, still-blocked member, dependent batch, request-order mismatch, newly exposed unrequested ticket, and returned research each have a specified outcome.
- Accepted smell: the prose-only start gate cannot mechanically prevent a noncompliant model from auto-claiming a ticket. This is an intentional bounded trade-off for preserving the portable skill contract; explicit flow transitions, examples, and static contradiction checks make violations visible. No unresolved structural smell remains.

## Data & Flow

1. The session loads the map, reads its destination, decisions, fog, branch, operation rules, and returned research using the existing orientation step.
2. If the user has not explicitly requested ticket work, the session reports orientation or the current frontier and stops without claiming or changing a ticket. Invoking the skill or loading the map is not authorization.
3. The session resolves every explicitly named identifier before forming the authorization set. It reports and excludes unknown identifiers without substitution. One existing named ticket, the explicitly requested current next frontier ticket, or the remaining members of a named batch form the fixed authorization set; batch members are ordered by ticket file order.
4. At each member's turn, the session rereads current ticket state. A member is eligible only if it has `status: open` and every `blocked_by` ticket is resolved. If eligible, the session claims it, which removes it from the frontier while leaving it unresolved. If resolved, claimed, or still blocked, the session reports and skips it.
5. The session loads the resolving skill when the ticket type names one and resolves the claimed ticket in the same session as far as that type allows. It records the answer, status transition, map gist, consistency updates, and graduation or out-of-scope handling exactly as today.
6. The session advances only to the next member of the fixed authorization set. State changes from earlier authorized resolutions are visible at the next member's claim-time evaluation, so a later dependent member may become eligible. Newly created or unblocked tickets outside the set remain untouched.
7. When the authorization set is exhausted, the session stops and waits for another explicit request. Returned findings for a previously authorized research ticket continue through the existing absorption path without authorizing new work.
8. Existing route closing and map lifecycle behavior remains unchanged when every ticket is resolved; writing the route is a closing action, not authorization to start another ticket.

## Error Handling & Edge Cases

| Failure or edge case | Behavior |
|---|---|
| No explicit ticket request | Orient and stop; no ticket is claimed and no ticket status changes. |
| No next frontier ticket exists | Report that no frontier ticket is available; do not claim or start any ticket. |
| Named ticket does not exist | Report and exclude the unknown identifier before forming and ordering the fixed set; do not substitute another ticket. |
| Batch member is blocked when requested but an earlier authorized member is its last blocker | Keep it authorized; reevaluate at its later file-order turn and start it after the blocker resolves. |
| Batch member remains blocked at its turn | Report its unresolved dependencies, skip it, and continue only with later members already in the fixed set. |
| Batch member is claimed or resolved at its turn | Report it ineligible, do not mutate it, and do not substitute another ticket. |
| Batch is named in a different order from the map | Process the fixed set in ticket file order, not incidental request order. |
| A resolution creates or unblocks a ticket outside the set | Record it under existing map rules but do not start it without a separate explicit request. |
| Returned research findings appear on map load | Absorb findings for the previously authorized and dispatched ticket through the existing flow; this completes prior work rather than starting a new ticket. |
| Request is ambiguous about which tickets to start | Ask the user to name a ticket, request the next frontier ticket, or provide an explicit batch; do not infer authorization from a general map invocation. |

## Testing Strategy

This is a contract-only change, so no application or CLI test is added. Verification uses the requirements scenarios as a static conformance matrix:

- Confirm the skill's no-request path stops after orientation and cannot claim a ticket.
- Confirm next-frontier authorization chooses the first currently eligible ticket in file order.
- Confirm a next-frontier request against an empty frontier reports that no ticket is available and changes no status.
- Confirm `[01, 02]`, with `02` initially blocked only by `01`, resolves `01`, reevaluates `02`, and permits `02` in the same authorized batch.
- Confirm an unknown identifier is reported and excluded before ordering, while an existing member still resolved, claimed, or blocked at its turn is reported and skipped without substitution.
- Confirm a single-ticket request and a fixed batch both stop without auto-advancing outside the authorization set.
- Confirm claiming removes a ticket from the frontier while leaving it unresolved and in the claiming session's procedure.
- Confirm returned research is continuation of prior authorization rather than a new start.
- Search `skills/hamilton-wayfinder/SKILL.md`, `.hamilton/specs/wayfinder.md`, `.hamilton/specs/glossary.md`, `docs/skills.md`, and tickets 01 and 04 for the removed automatic-selection, one-ticket-per-session, one-file-per-session, and claiming-does-not-affect-frontier rules. The only surviving old statements must be under the source tickets' `## Outdated decisions` sections and link to this change's requirements.
- Validate the source-ticket links, run `git diff --check`, and inspect the final diff for scope, placeholders, flowing prose, and contradictions. No TypeScript build or runtime test is required because no executable artifact changes.

## Constraints & Boundaries

- Always: preserve ticket file order, the existing `open`/unblocked/unclaimed eligibility definition, claim-before-resolution, same-session resolution, typed-skill dispatch, research continuation, and map lifecycle.
- Always: update the live skill, `wayfinder` requirements delta, canonical Wayfinder spec at finish-work, docs summary, canonical glossary, and current Answers in source tickets 01 and 04 so all maintained truths agree.
- Always: preserve superseded source-ticket prose under `## Outdated decisions` with a relative link to this change's `requirements/wayfinder.md`.
- Ask first: any proposal to bypass blockers, change batch ordering, persist authorization in frontmatter, alter claim status values, or modify the meaning of a user request.
- Never: change templates, `CONTRIBUTING.md` mechanics, ticket types, `blocked_by` meaning, collision handling, route/unit semantics, task-ledger data, dependencies, or runtime code.

## Risks / Trade-offs

- [The normative gate is not mechanically enforceable] -> Make no-request, claim-time eligibility, and stop-after-authorization transitions explicit in numbered prose and the process diagram; preserve user-invoked mode; run contradiction searches during review.
- [Natural-language requests can be underspecified] -> Define three supported authorization shapes and require clarification rather than inferring a ticket from a generic map invocation.
- [Claim-time state can change between batch members] -> Deliberately reread status and blockers at each member's turn; the fixed set controls scope while current state controls safety.
- [Parallel truths can drift] -> Update the skill, spec, glossary, docs summary, and linked source tickets in one change; preserve prior decision text only where visibly marked outdated.
- [Users may expect request order] -> State ticket file order as the deterministic batch order in proposal, requirements, design, scenarios, and skill flow.

## Migration / Rollout

No data migration is required. Existing maps have no new fields, ticket statuses retain their meaning, and resolved source tickets receive prose-only consistency updates. Once distributed, future sessions wait after orientation unless the user explicitly requests ticket work; fixed batches can advance through dependencies at claim time, and claimed tickets remain unresolved but outside the frontier. Reverting the change is a documentation-only rollback across the same contract surfaces.

## Open Questions

*(none)*
