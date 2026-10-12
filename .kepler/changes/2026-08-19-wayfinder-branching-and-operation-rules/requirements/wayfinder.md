# Capability: wayfinder

The methodology for charting a map of decision tickets and working them to resolution; owns the charting and working processes, the map lifecycle, and the file-native map mechanics.

## ADDED Requirements

### Requirement: Map records its working branch

The map's frontmatter SHALL carry a `branch:` field, set at map creation to the branch the effort works from and merges back into, and the `## Map mechanics` contract SHALL define the field.

- Priority: must
- Rationale: a session — especially one in a linked worktree or on a prototype branch — must be able to determine from the map alone which branch is "home"; today nothing records it.

#### Scenario: Charting records the branch

- WHEN a map is created during charting
- THEN its frontmatter contains `branch:` set to the branch the charting session is on (the branch the effort's work will merge back into)

#### Scenario: A session orients from the branch field

- WHEN a working session loads a map whose frontmatter carries `branch:`
- THEN the session knows the branch to return to or merge back into after work on another branch (worktree or prototype branch) completes

#### Scenario: A pre-existing map lacks the field

- WHEN a session loads a map created before this change, with no `branch:` field
- THEN the session proceeds without it, treating the repository's default branch as the merge-back target

### Requirement: Charting asks for operation rules

During charting, after the destination is named, the skill SHALL ask the user for operation rules — standing per-effort instructions on how working sessions operate (e.g. commit after resolving a ticket, delegate a class of jobs to a named subagent) — and SHALL record them in the map's `Operation rules` section, which MAY be empty when the user declines to set any.

- Priority: must
- Rationale: users hold standing preferences about session mechanics that today have no home and are never solicited, so each session improvises.

#### Scenario: Rules are solicited at map creation

- WHEN charting reaches map creation
- THEN the user has been asked for operation rules and the map's `Operation rules` section holds what they gave (or is present and empty when they gave none)

### Requirement: Working sessions obey operation rules

The work loop's map-loading step SHALL read the map's `Operation rules` section, and the session SHALL apply each rule to the actions it covers (e.g. a commit-after-resolution rule produces a commit when the ticket resolves; a subagent-delegation rule routes the named job to the named subagent).

- Priority: must
- Rationale: rules that are recorded but not read are decoration; the load step is the one place every session passes through.

#### Scenario: Commit-after-resolution rule

- WHEN the map's Operation rules contain "always commit after resolving a ticket" and a session resolves a ticket
- THEN the session commits the ticket resolution (ticket file, map gist, and any artifacts) before ending

#### Scenario: Subagent-delegation rule

- WHEN the map's Operation rules direct a class of jobs to a specific subagent and the session encounters such a job
- THEN the session dispatches that job to the named subagent rather than doing it inline

### Requirement: Task tickets unblock decisions

A `task` ticket SHALL be created only when a named decision cannot be made until the work is done. Work that could wait until shipping SHALL NOT be ticketed — the decision SHALL instead be recorded (ticket `## Answer` + map gist) and applied during shipping via the route.

- Priority: must
- Rationale: shipping-deferrable work has been proposed as a `task` ticket, spending frontier ceremony on work with no decision to unblock; the guardrail keeps `task` scoped to work the map's frontier actually depends on.

#### Scenario: Shipping-deferrable work is not ticketed

- WHEN work could wait until shipping without blocking any named decision
- THEN it is not created as a `task` ticket — the decision is recorded (ticket `## Answer` + map gist) and applied during shipping via the route

## MODIFIED Requirements

### Requirement: Ticket-type dispatch is imperative

A ticket's `type` frontmatter field decides which skill resolves it: `research` → `hamilton-wayfinder-research`, `prototype` → `hamilton-wayfinder-prototype`, `grilling` → `hamilton-grilling` + `hamilton-wayfinder-domain-modeling`, `task` → driven in-session or handed to the human as a checklist. The resolving skill SHALL be loaded (its SKILL.md read, or invoked via the Skill tool) before any resolution work begins; resolving a typed ticket without loading its skill is a contract violation. For a `prototype` ticket specifically, the skill MUST NOT write any prototype code before `hamilton-wayfinder-prototype` is loaded.

- Priority: must
- Rationale: the previous phrasing ("delegate to the skill the ticket's type promises") reads as advisory to some models, which act in the skill's spirit — or skip it — without loading it; the dispatch must be stated as a hard precondition of resolution.

#### Scenario: Prototype ticket dispatch

- WHEN a session begins resolving a ticket whose `type` is `prototype`
- THEN `hamilton-wayfinder-prototype` is loaded before any prototype artifact is created, and the resolution follows that skill's process

#### Scenario: Dispatch precedes work for every type

- WHEN a session begins resolving a ticket of any type with a resolving skill
- THEN that skill is loaded before resolution work starts

### Requirement: A claimed ticket resolves in the claiming session

The work loop claims a ticket and then carries it forward in the same session: claiming marks the start of resolution, never a handoff — the claiming session SHALL take the ticket as far as its type allows, a HITL ticket resolving in that session and a research ticket being dispatched then, resolving when its findings return. The one-ticket-per-session budget SHALL be read as a ceiling of one ticket resolved per session (research excepted), never as a requirement to defer resolution to a later session. A `prototype` ticket claimed in a session SHALL have its prototype built in that session, human present.

- Priority: must
- Rationale: sessions have misread the budget as "claim now, resolve next session" ("It is a prototype ticket and must be resolved through hamilton-wayfinder-prototype; I'll proceed with that in the next session"), leaving claimed tickets stranded.

#### Scenario: Claim and resolve in one session

- WHEN a session claims a frontier ticket
- THEN the same session proceeds immediately to resolve it, and the ticket does not remain in `claimed` status awaiting a future session

#### Scenario: Prototype built in the claiming session

- WHEN a session claims a `prototype` ticket
- THEN it invokes `hamilton-wayfinder-prototype` and builds the prototype in that same session

### Requirement: The route carries shipping rules

When the map clears and `route.md` is written, the route SHALL include a `## Shipping rules` section between the preamble and `## Units`, describing how the units will be shipped: the branch units merge back into (taken from the map's `branch:` field), commit and merge/PR conventions, and any standing constraint every unit's shipping inherits. Operation rules from the map that concern shipping SHALL be carried into this section, so the route is self-contained for the SDD loop.

- Priority: must
- Rationale: the route is a static handoff read by downstream processes that never open the map; shipping conventions recorded only in the map (or nowhere) do not reach them.

#### Scenario: Route written from a cleared map

- WHEN every ticket is resolved and the route is written
- THEN `route.md` contains a `## Shipping rules` section naming the merge-back branch from the map's `branch:` field and any shipping-relevant operation rules

## REMOVED Requirements

*(none)*

## RENAMED Requirements

*(none)*
