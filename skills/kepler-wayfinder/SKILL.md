---
name: kepler-wayfinder
description: Chart a map of decision tickets for a goal too big for one session, then work the tickets the user explicitly authorizes until the way to the destination is clear.
disable-model-invocation: true
---

## Opening

Some goals are too big for one agent session — not because the work is hard, but because the way to the end is not yet clear. Wayfinding finds that way before the work begins: chart a **map** of the decisions standing between here and the **destination**, then work the **tickets** the user explicitly authorizes until the **frontier** is empty and the **fog of war** ahead has lifted. The map plans the way; the doing comes later, one change at a time.

## The map

The map is an **index**, not a store — it carries just enough to orient every session and points at the tickets that hold the detail. Six sections fix its shape: **Destination** (what reaching the end looks like), **Notes** (domain and standing preferences), **Operation rules** (per-session-binding instructions on how working sessions operate), **Decisions so far** (one line per resolved ticket, each linking back), **Not yet specified** (the fog), and **Out of scope** (work ruled beyond the destination). Notes holds standing context — the domain in one line and durable preferences; terminology belongs in the glossary, decisions in tickets. Operation rules holds prescriptive rules instead — e.g. commit after resolving a ticket, delegate a class of jobs to a named subagent — and may be left empty. The installed template provides the format; the skill fixes when to create it.

## Ticket types

Every ticket has a type that promises how it gets answered, and each type delegates to a skill:

- **research** (AFK) — a background investigation. Delegate to `kepler-wayfinder-research`, which reads primary sources and writes cited findings under the map.
- **prototype** (HITL) — a throwaway artifact that answers one design question. Delegate to `kepler-wayfinder-prototype`.
- **grilling** (HITL) — one-question-at-a-time dialogue that sharpens the decision and the effort's vocabulary. Run `kepler-grilling`, with `kepler-wayfinder-domain-modeling` sharpening terms as the dialogue moves.
- **task** (HITL or AFK) — manual work that unblocks a decision. Legitimate only when a named decision cannot be made until the work is done; work that could wait until shipping is not a ticket — record the decision (ticket Answer + map gist) and apply it during shipping via the route. Drive it directly where you can, or hand the human a precise checklist.

A planning ticket resolves only through live exchange with a human. The agent puts each decision to the human and waits — it never stands in for the human's side of the dialogue. Kepler's three-tier attendance model (Always / Ask first / Never) governs SDD execution downstream, not this planning stage.

## Skill dispatch

A skill MUST be loaded — its SKILL.md read, or invoked via the Skill tool — before any work in its spirit begins; never act in a skill's spirit without loading it first.

| Situation | Load | Write back before closing |
| --- | --- | --- |
| Charting: name the destination, map the frontier | `kepler-grilling` + `kepler-wayfinder-domain-modeling`, both before the first question | Destination and Notes in the map; working glossary terms |
| Grilling ticket | `kepler-grilling` + `kepler-wayfinder-domain-modeling`, both before the first question | Ticket `## Answer`; glossary updates; map gist |
| Prototype ticket | `kepler-wayfinder-prototype` | Ticket `## Answer` + pointer to the prototype branch; map gist |
| Research ticket | `kepler-wayfinder-research` (background agent) | Findings file + ticket pointer; on return, ticket `## Answer` + map gist (work loop step 1) |
| Task ticket | none — drive directly, or hand the human a checklist | Ticket `## Answer`; map gist |

Every grilling invocation supplies content and an exit condition (see grilling's Invocation contract).

## Fog of war

Not every decision can be stated sharply at the start. The fog of war is the dim view ahead — decisions you can tell are coming but cannot yet pin down, because they hang on questions still open. It lives in the map's Not yet specified, deliberately uncharted. The test separating fog from a ticket is whether the question can be stated precisely now, not whether it can be answered now. When a resolution makes a foggy question specifiable, the fog graduates: it clears from Not yet specified and becomes a new ticket.

## Out of scope

Some work is consciously ruled beyond the destination. It goes in Out of scope and stays there — it never graduates into a ticket, because a ticket exists to advance toward the destination and out-of-scope work does not. Listing it keeps later sessions from re-litigating the boundary.

## Chart the map

Charting is one session's work and resolves no tickets — it names the destination and lays out the frontier.

1. **Name the destination.** Run a `kepler-grilling` session to fix what reaching the end of the map looks like — the spec, decision, or change the effort is finding its way to.
2. **Map the frontier breadth-first.** Grill across the whole space, surfacing open decisions and first takeable steps.
3. **Check for fog.** If breadth-first grilling surfaces no fog, the way is already clear for one session — stop and tell the user a map is not needed.
4. **Ask for operation rules.** Ask the user for standing per-effort instructions on how working sessions operate — e.g. commit after resolving a ticket, delegate a class of jobs to a named subagent. The user may decline; the map's Operation rules section is then left empty.
5. **Create the map.** Write it from the installed template at `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/wayfinder/map.md`, with `branch:` set to the branch the charting session is on — the branch the effort works from and merges back into (on a detached HEAD, record the repository's default branch and tell the user) — Destination and Notes filled in, Operation rules holding whatever the user gave in the previous step, Decisions so far empty, and the fog sketched into Not yet specified.
6. **Create the tickets that can be specified now.** Write each from the installed template at `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/wayfinder/ticket.md`, then wire each ticket's blocking dependencies in a second pass once the set exists.
7. **Fire research in parallel.** For any research tickets, dispatch `kepler-wayfinder-research` subagents so the reading happens in the background while charting continues.

## Work through the map

Working resolves only the tickets an explicit user request authorizes — invoking Wayfinder or loading the map is orientation, not authorization, and never starts a ticket on its own.

1. **Load the map and absorb returned research.** Read its low-resolution view to orient: the destination, the decisions already made, and the fog still ahead. Read the frontmatter's `branch:` and the Operation rules section too, and apply each rule to the actions it covers as the session proceeds — a commit-after-resolution rule produces a commit when a ticket resolves; a subagent-delegation rule routes the named job to the named subagent rather than doing it inline. Then check for returned research: for each completed investigation, distill the findings into its ticket's `## Answer`, link the findings file from the ticket body, mark the ticket resolved, and gist it to the map. This absorbs a research ticket that was already explicitly authorized and dispatched — continuation of that prior authorization, not a new one — and does not authorize any other ticket.
2. **Establish the fixed authorization set, or stop.** If the user has not explicitly requested ticket work, report the orientation or the current frontier and stop: no ticket is claimed and no status changes. Invoking Wayfinder or loading the map does not authorize ticket work — an explicit user request is required before any ticket starts.
3. **Resolve the request into identifiers.** For a request naming one ticket, or naming several as a batch, resolve each named identifier against the map; report and exclude any identifier that does not resolve to a ticket, without substituting another one. For a request for the current next frontier ticket, select the first open, unblocked, unclaimed ticket in file order; if none exists, report that no frontier ticket is available and stop without claiming or starting anything.
4. **Form the fixed authorization set.** The resolved ticket — one named ticket, the selected next-frontier ticket, or the remaining members of a named batch — becomes the session's fixed authorization set for the rest of this loop. Order a batch by the map's ticket file order, regardless of the order named in the request; the set never grows or shrinks afterward.
5. **Reread the next member at its turn.** Reread its current `status:` and every `blocked_by:` ticket's status immediately before its turn — state can have changed since an earlier authorized member resolved.
6. **Claim an eligible member, or report and skip.** A member is eligible only when it is then `open`, unblocked, and unclaimed. Claim it — mark it in hand before any work begins, which removes the ticket from the frontier while leaving it unresolved. Report and skip, without substitution, a member that is resolved, claimed, or still blocked at its turn. A member blocked when requested stays authorized: in batch `[01, 02]`, ticket `02` blocked only by unresolved `01` becomes eligible and runs at its later turn once authorized `01` clears that blocker. Claiming is the start of resolution, not a handoff: the claiming session immediately takes an eligible member as far as its type allows — a HITL ticket resolves in this session; a research ticket is dispatched now and resolves when its findings return.
7. **Resolve it.** The skill the ticket's type promises (see Skill dispatch) MUST be loaded before any resolution work, where the type names one — resolving a typed ticket without loading its skill is a contract violation. For a prototype ticket specifically, no prototype code exists before `kepler-wayfinder-prototype` is loaded and its branch gate has run.
8. **Record the answer.** Append the resolution under a `## Answer` heading in the ticket, mark the ticket resolved, and append a one-line gist to the map's Decisions so far with a link back to the ticket.
9. **Consistency pass.** Scan the map's Decisions so far for gists the new resolution contradicts. For each, open that ticket, move its old Answer to `## Outdated decisions` with a link to the superseding ticket, write the current truth into `## Answer`, and rewrite its gist line in the map. If the route exists, update the affected unit's decision line as well.
10. **Graduate or close.** If the resolution makes new tickets specifiable, create them and clear the graduated fog from Not yet specified. If it reveals a ticket sits beyond the destination, close the ticket and leave one line in Out of scope. A ticket this creates or newly unblocks is never started in this session unless it was already a member of the fixed authorization set.
11. **Advance only within the fixed set, or stop.** Return to step 5 for the next member of the fixed authorization set. When the set is exhausted, stop and wait for another explicit request — never claim or start a ticket outside the set, however eligible it has since become. Never park a claimed ticket along the way — take it as far as its type allows before the session ends. When this resolution leaves every ticket on the map resolved, the map clears and the route is written per The route below, as the existing closing act — writing it is a closing act, not authorization to start another ticket.

## The route

When the last ticket resolves, synthesize the current destination and the causal path that makes it necessary. State the point of departure from the goal and resolved ticket questions, not as a chronology of the map. Then synthesize a self-contained destination from the map's destination, current ticket answers, glossary terms, binding constraints, and out-of-scope boundaries. If that synthesis exposes a contradiction or essential ambiguity, keep the map open, resolve the gap through another ticket or user exchange, and do not write the route.

The route is a static handoff written once as the map's closing act, from the installed template at `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/templates/wayfinder/route.md`. Write its five core body sections below; a lint-valid existing route is not invalid merely because it includes other sections:

1. **Point of departure** states the current situation and causal path from the goal and resolved ticket questions.
2. **Destination** states the outcome, concrete shape where it removes meaningful ambiguity, guardrails, and builder latitude. Builder latitude is limited to local choices that cannot change the destination; unresolved product or architectural decisions keep the map open.
3. **Path chosen** states each choice, a concise rationale, its binding consequence, and a link to the ticket. Detailed evidence, rejected alternatives, and superseded reasoning stay in tickets; current rationale and consequences travel in the route.
4. **Shipping rules** names the map's `branch:` as the merge-back target and carries any shipping-relevant Operation rules, so downstream processes that do not open the map can still ship the units correctly.
5. **Units** lists coarse delivery boundaries in causal order, with each unit's destination contribution, observable completion outcome, unit-specific constraints, dependencies, and backing ticket links. Units do not prescribe implementation steps.

Before closing the map, run the consistency gate against the synthesized route: verify decision coverage, destination coverage by units, causal dependency ordering, and scope boundaries. Then verify route structure: unit IDs are unique; frontmatter IDs, names, and order exactly match the numbered Units headings; every dependency is unique, non-self, names an existing unit, and the graph is acyclic. A route lint pass checks structural coherence, not semantic consistency, destination coverage, or shipped/reachable prerequisites. The gate has no score or report section. If it fails, keep the map open and resolve the gap; contradictions or essential ambiguity must not be carried into the route.

After the consistency gate passes and before writing the route, fold the working glossary's resolved terms into the canonical `.kepler/specs/glossary.md` by bounded context, preserving distinct scoped meanings and source references and confirming with the user any change to committed language. Use the installed glossary template only if the canonical file is missing; preserve an existing glossary's content and format rather than regenerating it. A newer working term does not override a canonical meaning without that confirmation. Because this mutates a canonical spec, when creating it, read `git config user.name` and `git config user.email` and record `author: Name <email>` in its frontmatter. If either configured identity is missing, stop and report it; never invent attribution. When editing an existing spec, preserve its recorded author exactly. Immediately after the fold, run `kepler workbench lint --file <spec-path>`. A nonzero result is a failed gate: resolve the findings and rerun before writing the route or handing off. Then write the route from the installed template; format mechanics remain in that template and in Map mechanics. After writing, run the route's file-scoped lint as specified in Artifact validation.

The map then moves through its lifecycle: open while charting and working, cleared when every ticket is resolved and the route is written, shipping while the route's units are executed, and shipped when the last unit lands. Each unit is executed by whatever downstream process the effort uses. The process that starts a unit flips it `pending → in-progress` on its own branch; the process that completes it flips it `in-progress → shipped`, so the flip ships with the work it marks. The process starting the first unit flips the map `cleared → shipping`; the process shipping the last unit flips the map `shipping → shipped`.

## Map mechanics

This section is the contract between the wayfinder methodology and its file-native implementation — the only place mechanics are defined. The rest of the skill refers to concepts; a future backend swaps this section and verifies in one pass that nothing above it defines a field, a path, or a branching rule.

**Frontmatter.** Every ticket and the map carry YAML frontmatter. Tickets use `type:` (`research` / `prototype` / `grilling` / `task`), `status:` (`open` / `claimed` / `resolved`), and `blocked_by:` (a list of ticket numbers). The map uses `status:` (`open` / `cleared` / `shipping` / `shipped`) and `branch:` (the branch the effort works from and merges back into, set at map creation; a map created before this field falls back to the repository's default branch).

**Route units.** The `units` frontmatter list in `route.md` carries each unit's `id`, `name`, `status`, `depends_on`, and `backed_by`. IDs are unique and ordered exactly like the numbered body headings; dependency IDs are unique, non-self, present, and acyclic. The executing process flips only the matching unit's `status` between `pending`, `in-progress`, and `shipped` (see The route), on its owner-bound source branch and with the matching change scaffolding. The status is a visible claim, not a lock. Map-level status is an aggregate summary, not proof that a particular unit is available or shipped.

**Frontier.** The frontier is the set of tickets with `status: open` — excluding `claimed` and `resolved` — whose every `blocked_by` entry is resolved, taken in file order. "Open" always names the status value; use "unresolved" for any ticket not yet resolved.

**File layout.** A map lives at `.kepler/maps/<effort>/` — an undated slug that is the effort's identity — holding `map.md`, `route.md` once the map clears, and `tickets/NN-slug.md` numbered from `01`.

**Claiming.** Setting a ticket's `status:` to `claimed` signals intent and removes it from the frontier. For downstream route units, the designated user/controller serializes claims and delivery, with one owner per unit and one writer per change/worktree. Before any new change artifact or code write, inspect known proposals/plans, local and visible remote branches, and worktrees for the same canonical unit; prefer resuming its owner, and never use a workspace suffix to create a second claim. A competing or ambiguous claim requires owner-directed resume/transfer or a stop. Transfer/release requires explicit owner authorization, inspection of partial work and Git/provider effects, preservation of history/work, and fresh dependency checks; never reset verified shipment. Retain shared, dirty, or ambiguously owned workspaces. A branch-local `in-progress` marker and local scan are visible evidence, not a cross-clone lock or proof of distributed exclusivity. Concurrent cross-clone claims/shipping are unsupported; do not add a lock, coordination service, or second status database. The owner-bound source branch must differ from the actual route target by normalized ref/configured mapping, not tip SHA.

**Branching.** Map and route artifacts are ordinary repo content, versioned and branched like source. A status flip rides the unit's owner-bound source branch and lands on the actual delivery target at merge, so the flip ships with the work it marks. A named source branch must differ from the normalized delivery target; matching tip SHAs do not make distinct branch roles identical, while local/remote spellings of the same target do not make them distinct. Between merges the route can lag on the default branch; verify its actual source and unit revision before acting rather than treating that lag as authorization.

## Artifact validation

Canonical specs, maps, tickets, and routes are recognized Kepler artifacts. Research notes under
`.kepler/maps/<effort>/research/` and prototype files are unrelated outputs and stay outside
this lint gate. After each write or edit of a recognized artifact, run the narrowest file-scoped
command for the artifact:

- `kepler workbench lint --file <spec-path>` for `.kepler/specs/glossary.md`.
- `kepler workbench lint --file <map-path>` for `.kepler/maps/<effort>/map.md`.
- `kepler workbench lint --file <ticket-path>` for `.kepler/maps/<effort>/tickets/NN-slug.md`.
- `kepler workbench lint --file <route-path>` for `.kepler/maps/<effort>/route.md`.

A nonzero lint result is a failed gate. Resolve the findings and rerun the matching command, or
report the exact blocker without handing off, claiming resolution, or committing. Charting lints
the map after creation, each ticket after creation or dependency edit, and the route after it is
written. Route closing lints the canonical spec immediately after folding the working glossary.
The work loop applies the same gate after every ticket answer, map gist, or route change before the
next mutation or handoff.

## Process flow

```dot
digraph kepler_wayfinder {
    "Name destination\n(grilling)" [shape=box];
    "Map frontier breadth-first" [shape=box];
    "Fog ahead?" [shape=diamond];
    "Stop — no map needed" [shape=doublecircle];
    "Ask for operation rules" [shape=box];
    "Create map + tickets\n(fire research in parallel)" [shape=box];
    "Load map\n(+ absorb returned research —\ncontinuation, not new authorization)" [shape=box];
    "Ticket work explicitly requested?" [shape=diamond];
    "Report orientation/frontier — stop" [shape=doublecircle];
    "Resolve named identifiers\n(report + exclude unknown)\nor select next frontier ticket" [shape=box];
    "Next frontier requested but none available?" [shape=diamond];
    "Report no frontier ticket available — stop" [shape=doublecircle];
    "Form fixed authorization set\n(ordered by ticket file order)" [shape=box];
    "Authorized member remains?" [shape=diamond];
    "Stop — wait for next explicit request" [shape=doublecircle];
    "Reread member at its turn\n(status + blockers)" [shape=box];
    "Member eligible now?\n(open, unblocked, unclaimed)" [shape=diamond];
    "Report + skip member\n(no substitution)" [shape=box];
    "Claim ticket\n(removes it from the frontier, stays unresolved)" [shape=box];
    "Load resolving skill, then resolve by type\n(research / prototype / grilling+modeling / task)" [shape=box];
    "Record answer in ## Answer\n+ gist in map Decisions so far" [shape=box];
    "Consistency pass\n(update superseded tickets + gists)" [shape=box];
    "Graduate fog / close out-of-scope" [shape=box];
    "Every ticket on the map resolved?" [shape=diamond];
    "Synthesize point of departure + destination\nwrite route after consistency gate\n+ Shipping rules (closing act)" [shape=doublecircle];

    "Name destination\n(grilling)" -> "Map frontier breadth-first";
    "Map frontier breadth-first" -> "Fog ahead?";
    "Fog ahead?" -> "Stop — no map needed" [label="no fog"];
    "Fog ahead?" -> "Ask for operation rules" [label="fog exists"];
    "Ask for operation rules" -> "Create map + tickets\n(fire research in parallel)";
    "Create map + tickets\n(fire research in parallel)" -> "Load map\n(+ absorb returned research —\ncontinuation, not new authorization)";
    "Load map\n(+ absorb returned research —\ncontinuation, not new authorization)" -> "Ticket work explicitly requested?";
    "Ticket work explicitly requested?" -> "Report orientation/frontier — stop" [label="no"];
    "Ticket work explicitly requested?" -> "Resolve named identifiers\n(report + exclude unknown)\nor select next frontier ticket" [label="yes"];
    "Resolve named identifiers\n(report + exclude unknown)\nor select next frontier ticket" -> "Next frontier requested but none available?";
    "Next frontier requested but none available?" -> "Report no frontier ticket available — stop" [label="yes"];
    "Next frontier requested but none available?" -> "Form fixed authorization set\n(ordered by ticket file order)" [label="no"];
    "Form fixed authorization set\n(ordered by ticket file order)" -> "Authorized member remains?";
    "Authorized member remains?" -> "Stop — wait for next explicit request" [label="no — set exhausted"];
    "Authorized member remains?" -> "Reread member at its turn\n(status + blockers)" [label="yes"];
    "Reread member at its turn\n(status + blockers)" -> "Member eligible now?\n(open, unblocked, unclaimed)";
    "Member eligible now?\n(open, unblocked, unclaimed)" -> "Report + skip member\n(no substitution)" [label="no"];
    "Report + skip member\n(no substitution)" -> "Authorized member remains?";
    "Member eligible now?\n(open, unblocked, unclaimed)" -> "Claim ticket\n(removes it from the frontier, stays unresolved)" [label="yes"];
    "Claim ticket\n(removes it from the frontier, stays unresolved)" -> "Load resolving skill, then resolve by type\n(research / prototype / grilling+modeling / task)";
    "Load resolving skill, then resolve by type\n(research / prototype / grilling+modeling / task)" -> "Record answer in ## Answer\n+ gist in map Decisions so far";
    "Record answer in ## Answer\n+ gist in map Decisions so far" -> "Consistency pass\n(update superseded tickets + gists)";
    "Consistency pass\n(update superseded tickets + gists)" -> "Graduate fog / close out-of-scope";
    "Graduate fog / close out-of-scope" -> "Every ticket on the map resolved?";
    "Every ticket on the map resolved?" -> "Synthesize point of departure + destination\nwrite route after consistency gate\n+ Shipping rules (closing act)" [label="yes — synthesis and gate pass"];
    "Every ticket on the map resolved?" -> "Authorized member remains?" [label="no"];
}
```
