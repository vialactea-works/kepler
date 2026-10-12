# Glossary

Wayfinder vocabulary — the terms the [hamilton-wayfinder map](../maps/hamilton-wayfinder/map.md)
established across its thirteen resolved decision tickets, harvested here so a proposal, design, or
route can cite a definition instead of re-deriving it from ticket prose. Each entry links the ticket
that settled it. This is a one-time harvest of decisions already made; keeping the glossary current
as future maps run is a separate concern.

## The map and its parts

**map** — A third kind of artifact under `.hamilton/`, sitting alongside `specs/` and `changes/`
rather than inside either. A map spans several changes and outlives all of them, so it is neither
ephemeral-per-change nor durable-per-capability. It lives at `.hamilton/maps/<effort>/` under an
undated slug — the effort name is its identity, the way a capability name is in `specs/` — and holds
`map.md`, a `tickets/` directory, and, once the map clears, `route.md`. The map body is an index,
not a store: it carries Destination, Notes, Operation rules, Decisions so far, Not yet specified,
and Out of scope, gisting each resolved decision in one line and linking the ticket that holds the
detail; its frontmatter records the branch the effort works from and merges back into. A cleared
map stays in place, neither deleted nor archived.
([Map artifact layout](../maps/hamilton-wayfinder/tickets/01-map-artifact-layout.md))

**destination** — The map's first section, fixing what reaching the end of the map looks like: the
spec, decision, or change the effort is finding its way to. Every session orients to it before
choosing a ticket. Once `route.md` exists it is linked from Destination rather than given a section
of its own, since the route is the destination made concrete.
([Map artifact layout](../maps/hamilton-wayfinder/tickets/01-map-artifact-layout.md))

**decision ticket** — One question whose resolution is a decision, held in its own file at
`tickets/NN-slug.md` and numbered from `01`. One file is one ticket-sized working target: a session
opens each ticket it explicitly claims and may work several in file order when the user authorizes a
batch; the numbers give stable identity and reading order, and the slugs make links legible. The
body states the question, the answer is appended under `## Answer` on resolution, and the map
records only a one-line gist pointing back.
([Map artifact layout](../maps/hamilton-wayfinder/tickets/01-map-artifact-layout.md) for the
file-per-ticket layout, numbering, and reading order; explicit-claim, batch-authorized working
target per [`wayfinder`](wayfinder.md#decisions))

**route** — A static handoff document written once at map close that compiles the current understanding
of the destination and the causal path chosen. The map remains the live exploration index and tickets
remain the detailed evidence and decision records; the route is self-contained at the outcome-and-
constraints level while linking tickets for detailed evidence, rejected alternatives, and superseded
reasoning. It contains Point of departure, Destination, Path chosen, Shipping rules, and Units. Units
are coarse delivery boundaries listed in order with their dependencies, not implementation tasks or
designs. Shipping rules state the merge-back branch and standing shipping constraints, and each unit
carries a status for the downstream SDD loop. It is written as a closing act after every ticket is
resolved; route writing is gated by destination coherence, decision traceability, unit coverage,
causal dependencies, and boundary preservation. Contradictions or essential ambiguity keep the map
open for another consistency pass or decision ticket.
([route.md shape and the SDD join](../maps/hamilton-wayfinder/tickets/06-route-shape-and-sdd-join.md))

## Working the map

**frontier** — The open, unblocked, unclaimed tickets: the edge of the known, and what a session
picks its next ticket from. A ticket is unblocked once every ticket blocking it is resolved. Where
upstream computes this as a tracker query, a file-native map computes it as a directory scan, reading
the `status` and `blocked_by` frontmatter across `tickets/`.
([Map mechanics in files](../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md))

**fog of war** — The dim view of decisions and investigations you can tell are coming but cannot yet
pin down, because they hang on questions that are still open. It is written into the map's Not yet
specified section and left deliberately uncharted: resolving a ticket clears the fog ahead of it,
graduating whatever has become specifiable into fresh tickets. The test separating fog from a ticket
is whether the question can be stated precisely now — not whether it can be answered now.

**claim** — A signal, recorded on a ticket's status, that the ticket is being actively worked.
Claiming survives the move from a shared tracker to files, where concurrent sessions collide through
git rather than through assignees: the status does not prevent a collision, but it tells a reader the
ticket is already in hand. Claiming removes the ticket from the frontier, so another request cannot
select or start it, while the ticket itself stays unresolved until its `## Answer` is recorded.
([Map mechanics in files](../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md) for claim
signaling and git-collision behavior; the frontier-removal effect per [`wayfinder`](wayfinder.md#decisions))

## From map to code

**change-sized unit** — One thing that runs the propose→finish loop once. Its size is set by what a
single agent can hold in context in one change, roughly "one feature or one fix". Splits that make
units smaller happen during wayfinding, before `route.md` is written, not during implementation.
`route.md` and the map's own tickets use **unit** as the route-time shorthand for the same thing.
([route.md shape and the SDD join](../maps/hamilton-wayfinder/tickets/06-route-shape-and-sdd-join.md))

**ticket type** — Which kind of work resolves a ticket, recorded in the ticket's `type` frontmatter
field. There are four. `research` (AFK) reads documentation or other sources outside the working
directory to surface a fact a decision waits on. `prototype` (HITL) makes a cheap, rough artifact to
react to when the question is how something should look or behave. `grilling` (HITL) is
one-question-at-a-time dialogue, and is the default case. `task` (HITL or AFK) is manual work that
must happen before a decision can be made — the one type that does rather than decides, earning its
place by unblocking a decision. A HITL type resolves only through live exchange with a human; the
agent never stands in for the human's side of it.
([Ticket types](../maps/hamilton-wayfinder/tickets/08-ticket-types.md), recorded per
[Map mechanics in files](../maps/hamilton-wayfinder/tickets/04-map-mechanics-in-files.md))

**cleared / shipping / shipped** — The map's status progression once charting ends. `cleared` marks
that every ticket is resolved and `route.md` is written. `shipping` marks that the route's units are
flowing through the SDD loop. `shipped` marks that all units are complete and the map has reached its
destination.
([route.md shape and the SDD join](../maps/hamilton-wayfinder/tickets/06-route-shape-and-sdd-join.md))
