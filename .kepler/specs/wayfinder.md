# Capability: wayfinder

## Overview

The methodology for charting a map of decision tickets and working the tickets the user explicitly authorizes — one ticket, the next frontier ticket, or a named batch — until the way to the destination is clear. A map is a third kind of artifact under `.hamilton/maps/<effort>/` — alongside `specs/` and `changes/` — that spans several changes and outlives all of them. The skill has two branches: charting a new map from a loose idea, and working an existing map's tickets to resolution. When every ticket is resolved, the map clears and a `route.md` is written as a static handoff to the SDD loop. This capability owns the charting and working processes, the map lifecycle, the frontier and fog-of-war mechanics, and the file-native map mechanics; it defers to `glossary` for what the terms mean and to `ticket-resolution` for how each ticket type is resolved.

## Contract

### Invocation

The skill is user-invoked (`disable-model-invocation: true`). The `description` field is a human-facing one-line summary, not a model-facing trigger list. No other skill needs to reach wayfinder — it is the pre-SDD entry point, always initiated by a person choosing to start planning.

### Ticket-type dispatch

A ticket's `type` frontmatter field decides which skill resolves it, and loading that skill is a hard precondition of resolution: the resolving skill is read (or invoked via the Skill tool) before any resolution work begins, never acted for in spirit. The skill reaches each by name, which is possible because all four are model-invoked:

| ticket type | resolving skill |
| --- | --- |
| `research` | `hamilton-wayfinder-research` |
| `prototype` | `hamilton-wayfinder-prototype` |
| `grilling` | `hamilton-grilling` + `hamilton-wayfinder-domain-modeling` |
| `task` | driven in-session, or a checklist handed to the human |

### Templates

Format details live in the installed templates, not in the skill body. The skill points at them and never reproduces their structure:

| artifact | template |
| --- | --- |
| map | `~/.hamilton/templates/wayfinder/map.md` |
| ticket | `~/.hamilton/templates/wayfinder/ticket.md` |
| route | `~/.hamilton/templates/wayfinder/route.md` |

### Map mechanics

The file-native contract for map artifacts. This is the swappable surface — a future tracker backend changes this section and nothing else in the skill, together with the self-contained `## Map mechanics` section in `CONTRIBUTING.md` that serves contributors. The two sections document the same contract for different audiences (agent runtime vs human contributor); consolidating them is a deliberate future effort.

| frontmatter field | valid values |
| --- | --- |
| `type` (ticket) | `research` / `prototype` / `grilling` / `task` |
| `status` (ticket) | `open` / `claimed` / `resolved` |
| `status` (map) | `open` / `cleared` / `shipping` / `shipped` |
| `branch` (map) | the branch the effort works from and merges back into, set at map creation |
| `blocked_by` | YAML list of ticket numbers (`[]`, `[01]`, `[01, 04, 06, 09]`) |

`map.md` carries `status` and `branch` — no `type` — matching the map template; a map's role is determined by its filename, not a frontmatter type. A map created before the `branch` field exists falls back to the repository's default branch as its merge-back target. A map lives at `.hamilton/maps/<effort>/` holding `map.md`, a `tickets/` directory of `NN-slug.md` files numbered from `01`, and — once the map clears — `route.md`. Map artifacts are ordinary repo content, versioned and branched like source. A status flip rides the unit's own branch and lands on the default branch at merge. Claiming a ticket sets its status to `claimed` as a signal of active work; it removes the ticket from the frontier and from eligibility for another start request while leaving it unresolved — claiming does not prevent a git collision, only signals that the ticket is in hand.

## Behavior

**Charting.** When a user arrives with a loose idea too big for one session, the skill runs a grilling session to name the destination — what reaching the end of the map looks like. With the destination named, it grills breadth-first across the whole space, surfacing open decisions and first takeable steps. If breadth-first grilling surfaces no fog — the way is already clear for one session — the skill stops and tells the user a map is not needed. When fog is surfaced, it asks the user for operation rules — standing per-effort instructions on how working sessions operate, such as committing after every resolved ticket or delegating a class of jobs to a named subagent — then creates the map from the installed template, with Destination and Notes filled in, Operation rules holding what the user gave (or present and empty when they gave none), `branch` set to the branch the charting session is on (on a detached HEAD, the repository's default branch is recorded and the user told), Decisions so far empty, and the fog sketched into Not yet specified. It creates the tickets that can be specified now from the ticket template, then wires `blocked_by` in a second pass. Research tickets raised during charting fire `hamilton-wayfinder-research` subagents in parallel. Charting is one session's work and resolves no tickets itself.

**Working.** When a user invokes with an existing map, the skill loads the map's low-resolution view, including its `branch` and Operation rules — each rule binds the session's actions (a commit-after-resolution rule produces a commit when the ticket resolves; a delegation rule routes the named job to the named subagent). Loading the map, invoking the skill, or reporting the frontier is orientation only — none of it authorizes a ticket. Only an explicit user request forms an authorization set: a named ticket, the current next frontier ticket, or a named batch. Named identifiers are resolved before the set is formed, and an identifier that does not resolve to a ticket is reported and excluded without substitution. A batch's remaining members form a fixed set ordered by the map's ticket file order — the same ordering the frontier uses — and that set never grows or shrinks once formed. The session evaluates each member's eligibility only when its turn is reached, rereading its current status and blockers: it starts a member that is then open, unblocked, and unclaimed, and reports and skips — without substitution — a member that is resolved, claimed, or still blocked at its turn. Because eligibility is reevaluated at each member's own turn, an earlier authorized member's resolution can clear a later member's blocker in time for that member's own turn in the same batch.

Starting an eligible member sets its status to `claimed` before any work; claiming is the start of resolution, not a handoff — the claiming session immediately takes the ticket as far as its type allows: a HITL ticket resolves in that session, and a research ticket is dispatched then, resolving when its findings return and a later session's step 1 absorbs them as continuation of that same authorization, not as authorization for a new ticket. It resolves the ticket by loading the skill its type delegates to before any resolution work — for a prototype ticket, no prototype code is written before `hamilton-wayfinder-prototype` is loaded and its branch gate has run — then appends the answer under `## Answer` in the ticket file, flips the ticket's status to `resolved`, and appends a one-line gist to the map's Decisions so far with a link to the ticket. When a resolution makes new tickets specifiable, it creates them and clears the graduated fog from Not yet specified; a ticket newly created or newly unblocked outside the fixed authorization set is recorded but not started without its own explicit request. When a resolution reveals a ticket sits beyond the destination, it closes the ticket and leaves one line in Out of scope. The session advances only to the next member of the fixed authorization set; when the set is exhausted, it stops and waits for another explicit request rather than selecting any other frontier ticket.

**The route.** When every ticket is resolved, the map clears and a `route.md` is written as a static handoff to the SDD loop — a closing act, not grown incrementally. The map remains the live exploration index, and tickets remain the detailed evidence and decision records. The route is the compiled current understanding of the destination and the causal path chosen: it is self-contained at the outcome-and-constraints level, while linking tickets for detailed evidence, rejected alternatives, and superseded reasoning. It contains five sections: **Point of departure**, which states the current situation and the forces that make the effort necessary; **Destination**, which states the outcome and constraints that define success; **Path chosen**, which explains the decisions and causal dependencies that lead from departure to destination, distinguishing builder latitude — choices that cannot change the destination — from unresolved product or architectural choices that keep the map open; **Shipping rules**, which states how units will ship — the branch they merge back into, taken from the map's `branch`, plus any shipping-relevant operation rules; and **Units**, which lists coarse delivery boundaries in order with their dependencies, without prescribing implementation tasks or designs. The route carries per-unit status for the downstream SDD loop. The map's status progresses `open` → `cleared` → `shipping` → `shipped`: `cleared` when the route is written, `shipping` while the route's units flow through the SDD loop, `shipped` when the last unit lands. Each unit runs the propose→finish-work loop once and flips its own status on its own branch. Wayfinder planning finishes when the route is accepted; downstream processes own construction and later route and unit lifecycle mutations.

**Strict HITL for planning.** A HITL ticket resolves only through live exchange with a human; the agent never stands in for the human's side of a planning dialogue. Hamilton's three-tier attendance model ("Always / Ask first / Never") applies to SDD execution, not to wayfinder's planning phase.

**Examples**

- a loose idea too big for one session -> a grilling session names the destination
- breadth-first grilling surfaces no fog -> the skill stops and tells the user a map is not needed
- fog is surfaced -> the user is asked for operation rules before the map is created; the map's Operation rules section holds them, or is present and empty
- fog is surfaced -> the map is created from the template, tickets created, blocking wired
- a map is created -> its frontmatter records the charting session's branch as `branch`
- a map without a `branch` field is loaded -> the repository's default branch is the merge-back target
- research tickets are created during charting -> `hamilton-wayfinder-research` fires in parallel
- charting completes -> one session's work, no tickets resolved
- an existing map is loaded with no explicit ticket request -> the session orients and reports the frontier without claiming or changing any ticket
- a user explicitly requests the next frontier ticket -> the first open, unblocked, unclaimed ticket in file order is claimed and resolved
- the next frontier ticket is requested and none is open, unblocked, and unclaimed -> the session reports none is available and claims nothing
- a user explicitly authorizes tickets `01` and `02` as a batch, and `02` is blocked only by unresolved `01` -> the session resolves `01`, then reevaluates `02` at its later turn and starts it once `01`'s resolution has cleared the blocker
- an explicitly named identifier does not resolve to a ticket -> it is reported and excluded before the authorization set is ordered, with no substitution
- an authorized batch member is resolved, claimed, or still blocked at its own turn -> it is reported and skipped, and no unrequested ticket takes its place
- a ticket is claimed -> claiming is never a handoff; the claiming session takes it as far as its type allows (HITL to resolution, research to dispatch) and it is never parked
- a prototype ticket is being resolved -> `hamilton-wayfinder-prototype` is loaded before any prototype code exists
- the map's Operation rules say commit after resolving a ticket -> the session commits the resolution before ending
- a ticket is resolved -> the answer is appended under `## Answer`, status flipped to `resolved`, a one-line gist added to Decisions so far
- a resolution makes new tickets specifiable -> the tickets are created and the graduated fog cleared from Not yet specified
- a resolution creates or unblocks a ticket outside the fixed authorization set -> it is recorded under the existing map rules but not started without its own explicit request
- a resolution reveals a ticket beyond the destination -> the ticket is closed and one line left in Out of scope
- work that could wait until shipping is proposed as a task ticket -> it is recorded as a decision instead and routed to shipping
- a research ticket that was already authorized and dispatched returns findings -> the session may absorb them through the existing return flow without that absorption authorizing a new ticket
- the fixed authorization set is exhausted -> the session stops and waits for another explicit request instead of claiming another frontier ticket
- every ticket is resolved -> the map clears and `route.md` is written
- the route is written -> its Shipping rules name the map's `branch` as the merge-back target, carrying any shipping-relevant operation rules
- a route unit completes its SDD loop -> it flips its own status on its own branch

## Invariants

- A route MUST compile the current destination and causal path from the resolved map; it MUST NOT become a second live exploration index.
- A route MUST preserve links to tickets as the drill-down source for detailed evidence, rejected alternatives, and superseded reasoning, while restating the outcome and constraints needed by downstream readers.
- A route MUST contain Point of departure, Destination, Path chosen, Shipping rules, and Units sections.
- Route units MUST be coarse delivery boundaries, not implementation tasks or designs; their change-sized-unit boundary and ordering dependencies MUST remain intact.
- The route-writing gate MUST verify destination coherence, decision-to-destination traceability, unit coverage, causal dependencies, and preservation of lifecycle and shipping boundaries. Contradictions or essential ambiguity MUST prevent map clearance and require another consistency pass or a decision ticket.
- Wayfinder planning MUST finish when the route is accepted; downstream processes own construction and later route and unit lifecycle mutations.
- The skill MUST be user-invoked (`disable-model-invocation: true`). A model-invoked description would add per-turn context load for a skill that fires only when a person chooses to start planning.
- The `## Map mechanics` section MUST be the only place in the skill body where file-native mechanics — frontmatter fields, file layout, claiming, branching — are defined. The rest of the body MUST refer to concepts without depending on the specific mechanics, so the section is genuinely swappable.
- The skill MUST NEVER reproduce format details that the templates at `~/.hamilton/templates/wayfinder/` already define. It points at the templates; it does not inline them.
- The skill MUST NEVER claim or start a ticket without explicit user authorization. Loading a map, invoking the skill, or resolving one authorized ticket MUST NOT authorize any other ticket.
- A fixed authorization set MUST NEVER grow or shrink once formed: an unknown identifier is excluded before ordering, and a member still ineligible at its own turn is skipped without substitution.
- The frontier MUST consist of tickets whose status is `open` and whose blockers are all resolved, in ticket file order; a `claimed` ticket MUST NEVER be part of the frontier.
- A claimed ticket MUST NEVER be parked — claiming is never a handoff, and the claiming session MUST take the ticket as far as its type allows (a HITL ticket to resolution; a research ticket to dispatch, resolving when its findings return and a later session's step 1 absorbs them).
- A ticket's resolving skill, where the type names one, MUST be loaded before resolution work begins. A prototype ticket MUST NEVER produce prototype code before `hamilton-wayfinder-prototype` is loaded and its branch gate has run.
- A HITL ticket MUST NEVER resolve without live human exchange. The agent MUST NEVER answer its own questions during a planning dialogue.
- A `task` ticket MUST unblock a named decision. Work that could wait until shipping is NEVER ticketed — the decision is recorded and applied during shipping via the route.
- The skill MUST reach the four ported siblings by name. If a sibling is not reachable, the ticket type that delegates to it is a promise that cannot be kept.
- The `NOTICE` MUST state original authorship under Apache 2.0 and MUST NOT use the "adapted from" pattern, because the skill text is original. The `SKILL.md` MUST NOT carry a provenance line.

## Decisions

- **Explicit authorization, not a session quota, is the start gate.** A user request — naming one ticket, the current next frontier ticket, or a named batch — is the only thing that starts ticket work; once authorized, a session may resolve every eligible member of that request in the same session, with no arbitrary per-session ceiling. Authorization is scoped to the current conversation, not persisted in any map or ticket field.
- **A named batch fixes membership at request time and evaluates eligibility at claim time.** Ordering the fixed set by ticket file order — the same basis the frontier uses — and rereading each member's status and blockers only at its own turn lets an earlier authorized resolution clear a later member's blocker within the same batch, without letting the set silently expand into the rest of the map.
- **User-invoked, matching upstream.** No other skill needs to reach wayfinder — it is the pre-SDD entry point, always initiated by a person choosing to start planning. A model-invoked description would add per-turn context load for a long skill that fires rarely. The ported siblings are all model-invoked, so wayfinder reaches them regardless of its own mode.
- **No `references/` directory; all material in the body.** For a user-invoked skill, the body loads only when the skill fires — body length is not a per-turn cost. The two branches (chart, work) share so much conceptual foundation that splitting them into references would create more load, not less. The templates are the external reference for format details.
- **`## Map mechanics` isolated in the body, not in `references/`.** The mechanics are needed every run — the agent reads frontmatter to scan the frontier and writes frontmatter to claim a ticket — so disclosing them behind a context pointer would add load for material that is always reached. The heading itself is the isolation boundary: a future backend swaps the section under that heading without touching the rest. Physical isolation is unnecessary when structural isolation is real.
- **The skill points at templates, never reproduces them.** The templates are the single source of truth for each artifact's shape; restating them in the skill body would duplicate that truth. The skill orients the agent to what each artifact is and when to create it; the template fixes what it looks like.
- **Original `NOTICE`, no provenance line.** The skill text is original — no upstream prose is copied, and ideas and methodologies are not copyrightable. The MIT license does not require attribution for an independent implementation. The root `NOTICE` carries the repo-level upstream attribution; the per-skill `NOTICE` follows the root's own-work copyright pattern.
- **Operation rules are a dedicated map section, not Notes.** Notes orients; rules bind. A prescriptive rule buried in orienting context is how it gets ignored, so the obligation gets a section a working session can be checked against, mirroring the route's Shipping rules.
- **The route is destination-first synthesis.** The map stays the live exploration index and tickets stay detailed evidence; the route compiles the accepted destination, constraints, and causal path so downstream readers can act without reopening the map. A consistency gate rejects contradictions and essential ambiguity before clearance.
- **The map records its merge-back branch.** A session in a linked worktree or on a prototype branch must learn where home is from the map alone; recording the charting branch once in frontmatter serves every downstream reader — the work loop, the route's Shipping rules — without tracking per-session branch history.
- **One capability, bounded against two neighbours.** `glossary` defines what a term means (what a map is); `ticket-resolution` defines how each ticket type is resolved and where its artifacts land; `wayfinder` owns how the map is charted and worked — the processes, the lifecycle, and the file-native mechanics.
- **Two homes for the mechanics contract.** The `## Map mechanics` contract lives in the skill (agent-facing, loaded at runtime) and in `CONTRIBUTING.md` (contributor-facing, self-contained and swappable). They serve different audiences and are not a copy; a future tracker backend swaps both. Consolidating them — making the skill point at `CONTRIBUTING.md` as the single source — is a deliberate future effort that touches the skill.
