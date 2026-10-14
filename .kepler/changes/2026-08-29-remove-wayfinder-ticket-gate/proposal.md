# Proposal: Remove Wayfinder's one-ticket-per-session gate

| Field | Value |
|---|---|
| Change | 2026-08-29-remove-wayfinder-ticket-gate |
| Status | approved |
| Author | Hermes Agent |
| Created | 2026-08-29 |
| Ledger task | 01M17S2EJKA960N3YDN0V54N38 |

## Why

The Wayfinder work loop currently treats invoking an existing map without a ticket name as permission to choose the first frontier ticket, and it limits non-research work to one ticket per session. The limit forces an artificial pause even when the user wants to direct several decisions in one session, while the implicit selection lets ticket work begin without a ticket-level request. The remaining safety boundary should be explicit user authorization, not a session-count quota.

The current contract also carries two older truths that conflict with the behavior this change needs: the glossary and ticket 01 equate one ticket file with one whole agent session, while the canonical Wayfinder spec and ticket 04 say claiming does not affect frontier calculation even though the live skill excludes claimed tickets. Leaving those sources untouched would make the new authorization rule depend on contradictory vocabulary and mechanics.

## Goals & Success Criteria

- Loading or invoking an existing map without a ticket request only orients the session; it does not claim or start a ticket.
- An explicit user request may authorize one named ticket, the next frontier ticket, or a named batch of tickets.
- A named batch is a fixed authorization set ordered by the map's ticket file order. Each member's current eligibility is evaluated only when its turn is reached: it starts if it is then open, unblocked, and unclaimed, and is skipped and reported if it is still ineligible.
- A batch member that is blocked when requested remains authorized and starts later in the same batch when an earlier authorized resolution clears its blockers before its turn.
- The claiming session resolves each eligible authorized ticket as far as its type allows, preserving the existing dispatch, answer capture, status, consistency, and map-gist behavior.
- A session may resolve more than one explicitly authorized ticket, but it stops when that authorization set is exhausted and never auto-claims an unrequested ticket, including a ticket newly created or unblocked by the authorized work.
- Setting a ticket to `claimed` removes it from the frontier while leaving it unresolved, so another request cannot select it as eligible work.
- The Wayfinder skill, canonical `wayfinder` spec, canonical glossary, source decision tickets 01 and 04, and user-facing skills reference describe the same authorization, session-scope, and claimed-frontier behavior.

## Non-Goals

- Do not change charting, map lifecycle values, ticket types, `blocked_by` semantics, claim status values, collision handling, resolving-skill dispatch, or the route handoff.
- Do not let an explicit request bypass unresolved dependencies, admit an unknown identifier to the authorization set, or start a ticket that is claimed, resolved, or still blocked when its authorized turn is reached.
- Do not change the existing research artifact flow; absorbing findings for a ticket that was already authorized and dispatched remains continuation of that authorized work, not authorization to start another ticket.
- Do not add a CLI command, tracker enforcement, helper script, persisted authorization field, migration, runtime code, or new behavioral capability.
- Do not change the map or ticket file format, templates, or `CONTRIBUTING.md` mechanics table. The source-ticket edits update decision truth without changing artifact shape or frontmatter.

## Proposed Change

Revise `skills/hamilton-wayfinder/SKILL.md` so the working loop loads the map and waits for an explicit ticket request rather than automatically selecting the first frontier ticket. Define the authorization shapes, order a named batch by ticket file order, and reevaluate each member immediately before its claim-time turn. This makes a dependent batch such as `[01, 02]` deterministic: if ticket 02 is blocked by ticket 01, resolving authorized ticket 01 can make authorized ticket 02 eligible for its later turn; a member still ineligible when reached is reported and skipped without substitution. Remove the non-research one-ticket-per-session ceiling, preserve claim-before-resolution and same-session resolution, and stop after the fixed authorization set instead of looping into unrequested work. Update the process-flow diagram, examples, invariants, opening, and skill description wherever they imply automatic selection or one-ticket-per-session behavior.

Write the `wayfinder` requirements delta so finish-work can align the canonical spec's Working behavior, frontier definition, examples, invariants, and decisions. The durable rule is that claimed tickets are unresolved but outside the frontier. Update `docs/skills.md` where its short Wayfinder summary would otherwise contradict user-directed multi-ticket sessions.

Repair the committed vocabulary and decision sources that the new contract supersedes. In `.hamilton/specs/glossary.md`, retain one file per decision ticket but describe each file as one ticket-sized working target rather than one session. In tickets 01 and 04 under `.hamilton/maps/hamilton-wayfinder/tickets/`, rewrite the affected current-answer statements and preserve the prior statements under `## Outdated decisions`, linked to this change's `wayfinder` requirements delta. Ticket 01 keeps file-per-ticket layout, stable numbering, and reading-order rationale; ticket 04 keeps claim signaling and collision behavior while correcting the frontier effect.

## Capabilities

### New

*(none)*

### Modified

- `wayfinder`: require explicit user authorization before starting ticket work, evaluate authorized batch members at their claim-time turn, permit several eligible authorized tickets in one session, stop without automatic advancement, and define claimed tickets as unresolved but outside the frontier.

### Removed

*(none)*

The glossary correction is canonical reference maintenance rather than a new behavioral capability, so it does not receive a separate requirements delta.

## Impact

This is a documentation and skill-contract change. The implementation surfaces are `skills/hamilton-wayfinder/SKILL.md`, `docs/skills.md`, `.hamilton/specs/glossary.md`, and source decision tickets `01-map-artifact-layout.md` and `04-map-mechanics-in-files.md`; finish-work folds `requirements/wayfinder.md` into `.hamilton/specs/wayfinder.md`. No TypeScript, CLI behavior, dependencies, templates, frontmatter, task-ledger data, or other persisted map state changes.

Verification is contract-oriented: inspect the edited prose and diagram; exercise the requirements scenarios for no request, next-frontier request, dependent batch, still-ineligible batch member, multiple resolutions, no automatic advancement, claimed-ticket exclusion, and returned research; then search every maintained source for stale automatic-selection, one-ticket-per-session, one-file-per-session, and claiming-does-not-affect-frontier statements. The two source tickets must retain the superseded prose only under `## Outdated decisions` with a link to the current requirement.
