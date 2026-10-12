# Capability: wayfinder

The methodology for charting a map of decision tickets and working them to resolution; this change revises how ticket work is authorized, how an authorized batch becomes eligible over time, how many authorized tickets a session may resolve, and how claiming affects the frontier.

## ADDED Requirements

*(none)*

## MODIFIED Requirements

### Requirement: Ticket starts require explicit user authorization

The working loop SHALL treat loading or invoking an existing map as orientation only. It SHALL form an authorization set only from a ticket the user explicitly names, the current next frontier ticket when the user explicitly requests it, or the tickets the user explicitly names as a batch. Invoking Wayfinder, loading a map, reporting the frontier, or resolving one authorized ticket SHALL NOT authorize any other ticket.

For any explicitly named request, the working loop SHALL resolve the named identifiers before forming the authorization set. It SHALL report and exclude an unknown identifier without substituting another ticket. For a named batch, it SHALL order the remaining fixed authorization set by the map's ticket file order. For every authorization set, it SHALL reevaluate each member immediately before that member's turn. A member SHALL start only when it is then open, unblocked by unresolved tickets, and unclaimed. A batch member that is blocked when requested SHALL remain authorized while earlier members run; when an earlier authorized resolution clears its blockers before its turn, it SHALL start in that same batch. A member that is resolved, claimed, or still blocked when its turn is reached SHALL be reported and skipped, and the session SHALL NOT substitute an unrequested ticket.

- Priority: must
- Rationale: the user-request gate is the intended control boundary. Claim-time evaluation lets an explicitly authorized dependent batch progress without bypassing dependencies, while a fixed authorization set prevents the batch from silently expanding into the rest of the map.

#### Scenario: Map invocation without a ticket request

- WHEN a user invokes Wayfinder with an existing map but does not request ticket work
- THEN the session loads the map and reports its orientation or frontier without changing any ticket status or claiming a ticket

#### Scenario: Explicit request for the next frontier ticket

- WHEN a user explicitly asks Wayfinder to work the next frontier ticket
- THEN the session selects the first currently open, unblocked, unclaimed ticket in file order and claims it before resolution

#### Scenario: No next frontier ticket exists

- WHEN a user explicitly asks Wayfinder to work the next frontier ticket and no open, unblocked, unclaimed ticket exists
- THEN the session reports that no frontier ticket is available and does not claim or start any ticket

#### Scenario: Dependent members in an explicit batch

- WHEN a user explicitly authorizes tickets `01` and `02` as a batch, ticket `02` is blocked only by unresolved ticket `01`, and ticket `01` precedes ticket `02` in file order
- THEN the session resolves eligible ticket `01`, reevaluates ticket `02` at its later turn, and starts ticket `02` in the same batch after ticket `01` has resolved its blocker

#### Scenario: Explicitly named identifier is unknown

- WHEN an explicitly named ticket identifier does not resolve to a ticket in the map
- THEN the session reports and excludes the unknown identifier before ordering the authorization set and does not substitute any unrequested ticket

#### Scenario: Existing batch member remains ineligible at its turn

- WHEN an authorized batch member is resolved, claimed, or still blocked when its file-order turn is reached
- THEN the session reports and skips that member without changing it and without substituting any unrequested ticket

#### Scenario: Request order differs from file order

- WHEN a user names several tickets in an order different from the map's ticket file order
- THEN the session processes the fixed authorization set in ticket file order and applies claim-time eligibility to each member

### Requirement: Authorized work may resolve multiple tickets without automatic advancement

After explicit user authorization, the work loop SHALL claim and resolve each eligible member of the fixed authorization set in the same session as far as its ticket type allows, preserving resolving-skill dispatch, answer capture, status transitions, consistency checks, and map gists. The work loop SHALL NOT impose a one-ticket-per-session ceiling. When the authorization set is exhausted, the session SHALL stop and wait for another user request rather than selecting or claiming any other frontier ticket.

A ticket created or newly unblocked by an authorized resolution SHALL NOT start unless it was already named in the fixed authorization set and becomes eligible before its own turn. Findings returned for a research ticket that was already authorized and dispatched MAY be absorbed by the existing return flow; that absorption SHALL NOT authorize a new ticket.

- Priority: must
- Rationale: the session budget should reflect the user's explicit scope rather than an arbitrary count, while the fixed-set boundary permits deliberate batches without automatic advancement.

#### Scenario: Single-ticket authorization stops without auto-advance

- WHEN a user explicitly requests one eligible ticket and another eligible frontier ticket remains after it resolves
- THEN the requested ticket is resolved as far as its type allows and the session does not claim or start the remaining ticket

#### Scenario: Explicit batch resolves multiple tickets

- WHEN a user explicitly authorizes multiple tickets and more than one becomes eligible at its claim-time turn
- THEN the session may resolve each eligible authorized ticket in the same session, subject to each ticket type's resolution procedure, and stops after the fixed authorization set

#### Scenario: A resolution exposes an unrequested ticket

- WHEN resolving an authorized ticket creates or unblocks a ticket that is not in the fixed authorization set
- THEN the new or newly eligible ticket is recorded according to the existing map rules but is not started without a separate explicit user request

#### Scenario: Returned research belongs to prior authorization

- WHEN a research ticket that was explicitly requested and dispatched returns findings in a later session
- THEN the session may absorb those findings into that already-started ticket through the existing research return flow without treating the absorption as authorization to start another ticket

### Requirement: Claimed tickets leave the frontier without resolving

The frontier SHALL consist of tickets whose status is `open`, whose blockers are all resolved, and which appear in ticket file order. Setting a ticket's status to `claimed` SHALL remove it from the frontier and make it ineligible for another ticket-start request while leaving it unresolved. Claiming SHALL remain a signal of active work rather than collision prevention, and the claiming session SHALL continue taking the ticket as far as its type allows.

- Priority: must
- Rationale: authorization depends on a single eligibility truth. A claimed ticket is still unfinished, but excluding it from the frontier prevents another session or another batch member from starting the same work.

#### Scenario: Claim removes a ticket from the frontier

- WHEN an open, unblocked ticket is claimed
- THEN it is no longer part of the frontier and another request does not select or start it

#### Scenario: Claimed does not mean resolved

- WHEN a ticket has status `claimed`
- THEN it remains unresolved and the claiming session continues its existing same-session resolution procedure

## REMOVED Requirements

*(none)*

## RENAMED Requirements

*(none)*
