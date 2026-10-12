---
artifact: route
effort: hamilton-wayfinder
status: shipped
created: 2026-08-08
updated: 2026-09-21
decision: accepted
units:
  - id: 1
    name: Land the glossary
    status: shipped
    depends_on: []
    backed_by:
      - tickets/07-which-siblings-to-port.md
  - id: 2
    name: Adopt Apache 2.0 and the attribution convention
    status: shipped
    depends_on: []
    backed_by:
      - tickets/03-fork-attribution.md
  - id: 3
    name: Land the wayfinder artifact templates
    status: shipped
    depends_on: []
    backed_by:
      - tickets/05-template-convention.md
      - tickets/04-map-mechanics-in-files.md
      - tickets/06-route-shape-and-sdd-join.md
  - id: 4
    name: Port hamilton-grilling
    status: shipped
    depends_on: [2]
    backed_by:
      - tickets/07-which-siblings-to-port.md
      - tickets/03-fork-attribution.md
  - id: 5
    name: Port the three wayfinder siblings
    status: shipped
    depends_on: [2]
    backed_by:
      - tickets/07-which-siblings-to-port.md
      - tickets/02-read-upstream-siblings.md
      - tickets/03-fork-attribution.md
  - id: 6
    name: Author hamilton-wayfinder
    status: shipped
    depends_on: [2, 3, 4, 5]
    backed_by:
      - tickets/01-map-artifact-layout.md
      - tickets/04-map-mechanics-in-files.md
      - tickets/05-template-convention.md
      - tickets/06-route-shape-and-sdd-join.md
      - tickets/07-which-siblings-to-port.md
      - tickets/08-ticket-types.md
      - tickets/09-boundary-with-propose-and-critique.md
      - tickets/13-map-artifacts-and-worktrees.md
  - id: 7
    name: Refactor propose and critique onto hamilton-grilling
    status: shipped
    depends_on: [4]
    backed_by:
      - tickets/12-propose-and-critique-use-grilling.md
  - id: 8
    name: Teach propose to read a route
    status: shipped
    depends_on: [6, 7]
    backed_by:
      - tickets/09-boundary-with-propose-and-critique.md
      - tickets/13-map-artifacts-and-worktrees.md
  - id: 9
    name: Sync the framework docs
    status: shipped
    depends_on: [6]
    backed_by:
      - tickets/10-framework-docs-presentation.md
      - tickets/03-fork-attribution.md
  - id: 10
    name: Convert the map's own files to the mechanics contract
    status: shipped
    depends_on: [3]
    backed_by:
      - tickets/04-map-mechanics-in-files.md

---

# Route — Fork wayfinder into Hamilton

## Point of departure

Hamilton needed a pre-SDD planning stage for goals too large for one change, but the upstream
Wayfinder shape assumed tracker-backed artifacts, sibling skills, and durable-truth locations that
Hamilton did not have. The fork also lacked a settled boundary between map decisions and the
per-change propose loop, a route contract, and a licensing and attribution convention for copied
skill text.

## Destination

### Outcome

Hamilton has a file-native Wayfinder capability that charts and resolves decision tickets, clears a
map into a destination-first route, and hands each coarse unit to the fixed SDD loop. The shipped
fork includes Wayfinder's three internal siblings, the reusable grilling primitive, canonical
artifact templates, synchronized documentation, and the route-aware propose handoff.

### Concrete shape

Maps live under `.hamilton/maps/<effort>/` beside `specs/` and `changes/`. Each map has `map.md`,
numbered `tickets/NN-slug.md`, and, when cleared, `route.md`. Tickets use the four upstream types:
`research`, `prototype`, `grilling`, and `task`; their answers hold detailed evidence and decision
history. A cleared route compiles the destination and causal path, then lists ten coarse,
change-sized units whose downstream entry is always `hamilton-propose`.

Wayfinder charts and works maps through live human judgment. Propose reads a route from the branch
where its session started, selects the next pending unit, and uses the synthesized route body as
primary current context before running its normal collaborative specification flow. Its `backed_by`
ticket links are optional drill-down for deeper evidence or rejected alternatives. The SDD loop
implements each unit and flips its status on the unit's branch.

### Guardrails and boundaries

- Map artifacts are ordinary repository content, versioned and branched like source; no tracker
  indirection or special default-branch write exists. ([Map artifact layout](tickets/01-map-artifact-layout.md), [Where map artifacts live relative to per-unit worktrees](tickets/13-map-artifacts-and-worktrees.md))
- Wayfinder planning is strict HITL: the agent never supplies the human's planning decisions.
  The SDD execution tiers apply only downstream. ([Ticket types in the Hamilton fork](tickets/08-ticket-types.md))
- Every route unit enters `hamilton-propose`; there is no straight-to-plan route path and no map
  critique equivalent. ([Boundary with hamilton-propose and hamilton-critique](tickets/09-boundary-with-propose-and-critique.md))
- The route is a handoff, not a second live exploration index. Tickets remain the evidence source;
  unresolved product or architectural ambiguity cannot be hidden as builder latitude. ([route.md shape and the SDD join](tickets/06-route-shape-and-sdd-join.md))
- The fork ports the three siblings near-verbatim and keeps upstream's full prototype branches;
  adaptation is limited to Hamilton paths, naming, attribution, and integration. ([Which siblings to port](tickets/07-which-siblings-to-port.md))
- Licensing and attribution travel with detached skill directories through sibling `NOTICE` files;
  the repository uses Apache 2.0 and preserves upstream MIT notices. ([Fork attribution and licensing](tickets/03-fork-attribution.md))

### Builder latitude

Propose, design, and plan choose implementation details inside each unit's fixed destination
boundary. Research findings may use per-research directories, prototypes remain throwaway, and
future tracker backends may replace the isolated mechanics contract without changing the artifact
meaning.

## Path chosen

- **File-native map artifacts.** Chose `.hamilton/maps/<effort>/` with one numbered ticket per file
  because maps span changes without becoming durable capability specs. Therefore maps, tickets, and
  routes remain inspectable repository content without tracker indirection. ([Map artifact layout](tickets/01-map-artifact-layout.md))
- **YAML mechanics.** Chose frontmatter for `type`, `status`, and `blocked_by` because it matches
  Hamilton's artifact conventions. Therefore the file-native fields and lifecycle values are
  queryable while the isolated mechanics contract remains replaceable. ([Map mechanics in files](tickets/04-map-mechanics-in-files.md))
- **Templates as the source of shape.** Chose bundled `map.md`, `ticket.md`, and `route.md`
  templates because Hamilton standardizes artifact shapes under `bundle/templates/`. Therefore
  Wayfinder depends on normal `hamilton setup` and does not duplicate formats in its skill body.
  ([Template convention](tickets/05-template-convention.md))
- **A route as destination-first synthesis.** Chose a static cleared-map handoff with causal path,
  constraints, shipping rules, and coarse units because tickets are the detailed decision record.
  Therefore downstream readers can act from the route without treating it as a chronological log or
  a second map. ([route.md shape and the SDD join](tickets/06-route-shape-and-sdd-join.md), [Compose route.md](tickets/11-compose-route.md))
- **A mandatory propose boundary.** Chose one change per session and propose for every route unit
  because Wayfinder decides what to build while propose turns one unit into an implementable
  change. Therefore all ten units share the same handoff and no straight-to-plan exception remains.
  ([Boundary with hamilton-propose and hamilton-critique](tickets/09-boundary-with-propose-and-critique.md))
- **Hamilton-level dialogue and internal siblings.** Chose `hamilton-grilling` as the reusable
  protocol and ported research, prototype, and domain-modeling under the Wayfinder prefix because
  callers need dialogue while each Wayfinder ticket type keeps its full behavior. Therefore the
  fork has no parallel CONTEXT/ADR system and hard decisions stay in ticket Answers. ([Which siblings to port](tickets/07-which-siblings-to-port.md), [Read the three upstream sibling skills](tickets/02-read-upstream-siblings.md), [Update propose and critique to use hamilton-grilling](tickets/12-propose-and-critique-use-grilling.md))
- **Map-aware propose.** Chose branch-local route reading because the route is ordinary repo content
  and status must travel with the unit that ships it. Therefore propose selects the next pending
  unit from the session's branch rather than reaching into the default branch. ([Boundary with hamilton-propose and hamilton-critique](tickets/09-boundary-with-propose-and-critique.md), [Where map artifacts live relative to per-unit worktrees](tickets/13-map-artifacts-and-worktrees.md))
- **Optional pre-change stage.** Chose Wayfinder before the six-skill core pipeline because it
  breaks complex goals into realizable units without changing the fixed SDD sequence. Therefore
  framework documentation presents it as optional and records the fork provenance separately.
  ([How the framework docs present the pre-SDD stage](tickets/10-framework-docs-presentation.md))

## Shipping rules

- Merge-back branch: `main` (the map has no explicit branch; the repository default is the fallback).
- Every route unit runs `hamilton-propose → plan → code → review → finish-work` once.
- Every unit that writes or edits a `SKILL.md` is authored against `/writing-great-skills`. Invoke it
  explicitly before drafting, since it has `disable-model-invocation: true`; this applies to the
  near-verbatim ports and their adaptation surface, including frontmatter, descriptions, invocation
  mode, naming, provenance, and re-homed paths. The near-verbatim rule governs upstream skill bodies;
  craft guidance does not license rewriting that prose to taste.
- Unit status flips ride that unit's branch and merge with its shipped implementation; concurrent
  default-branch staleness is accepted and merge conflicts keep both status rows.
- Map status progresses `cleared` → `shipping` → `shipped`; the final unit's merge makes `shipped`
  true.
- Forked skills carry their required sibling `NOTICE`; copied upstream material retains its MIT
  permission text and Hamilton's own work is Apache 2.0.

## Units

### 1. Land the glossary

**Destination contribution:** Establishes Hamilton's canonical Wayfinder vocabulary in
`.hamilton/specs/glossary.md`.

**Goal:** Harvest the terms and hard decisions actually recorded in the thirteen ticket Answers;
no missing working glossary is backfilled.

**Done when**

- `.hamilton/specs/glossary.md` contains the map, ticket, frontier, destination, route, unit, and
  lifecycle vocabulary needed by later Wayfinder work.
- The glossary reflects ticket Answers rather than inventing planning history.

**Binding constraints**

- The working glossary was never created, so this unit extracts resolved Answers directly. ([Which siblings to port](tickets/07-which-siblings-to-port.md), [Compose route.md](tickets/11-compose-route.md))

### 2. Adopt Apache 2.0 and the attribution convention

**Destination contribution:** Makes Hamilton's license and fork attribution distributable at repo
and detached-skill boundaries.

**Goal:** Ship the repository license, aggregate attribution, package declaration, contributor rule,
and per-fork notice convention before copied skills land.

**Done when**

- Apache 2.0 and root attribution artifacts exist, and each forked skill can carry its own notice.
- The contributor documentation states the sibling-`NOTICE` rule and upstream MIT text is preserved.

**Binding constraints**

- Detached skill directories are independent distribution units, so root-only attribution is
  insufficient. ([Fork attribution and licensing](tickets/03-fork-attribution.md))

### 3. Land the wayfinder artifact templates

**Destination contribution:** Installs the canonical shapes for maps, tickets, and compiled routes.

**Goal:** Add the three Wayfinder templates and the setup assertions and documentation mapping that
make them part of Hamilton's artifact system.

**Done when**

- `bundle/templates/wayfinder/` contains `map.md`, `ticket.md`, and `route.md` with the settled
  frontmatter and route-unit contract.
- Setup tests and contributor documentation cover the new template family.

**Binding constraints**

- Templates are the single source of artifact shape; route units retain their lifecycle and
  dependency boundaries. ([Template convention](tickets/05-template-convention.md), [route.md shape and the SDD join](tickets/06-route-shape-and-sdd-join.md))

### 4. Port hamilton-grilling

**Destination contribution:** Provides the reusable human-dialogue protocol used by propose and
critique.

**Goal:** Port the near-verbatim one-question-at-a-time grilling skill with Hamilton attribution.

**Done when**

- `hamilton-grilling` is reachable by other skills and waits for human decisions rather than
  answering for them.
- Its attribution notice and provenance adaptation are present.

**Binding constraints**

- Grilling owns protocol only; callers own question content and exit conditions. ([Update propose and critique to use hamilton-grilling](tickets/12-propose-and-critique-use-grilling.md), [Fork attribution and licensing](tickets/03-fork-attribution.md))

### 5. Port the three wayfinder siblings

**Destination contribution:** Supplies Wayfinder's research, prototype, and domain-modeling ticket
capabilities.

**Goal:** Port all three upstream siblings in full, re-homing only their Hamilton artifact paths and
context pointers.

**Done when**

- The three `hamilton-wayfinder-*` skills retain their full upstream branches and each has its
  required notice.
- Research, prototypes, glossary work, and hard decisions have the file-native homes fixed by the
  map.

**Binding constraints**

- Domain modeling does not create a parallel root `CONTEXT.md` or `docs/adr/`; its working glossary
  and hard decisions remain map-local. ([Read the three upstream sibling skills](tickets/02-read-upstream-siblings.md), [Which siblings to port](tickets/07-which-siblings-to-port.md))

### 6. Author hamilton-wayfinder

**Destination contribution:** Implements the file-native charting and ticket-resolution capability
that owns the map lifecycle.

**Goal:** Author the Wayfinder skill around the map, ticket, route, mechanics, lifecycle, and strict
HITL contracts.

**Done when**

- Wayfinder can chart, work, clear, and hand off maps using the bundled shapes and all four ticket
  types.
- Map mechanics are isolated, route synthesis is destination-first, and ordinary branching is
  explicit.

**Binding constraints**

- The `## Map mechanics` section is the only mechanics definition in the skill body, and templates
  are never reproduced there. ([Map mechanics in files](tickets/04-map-mechanics-in-files.md), [Template convention](tickets/05-template-convention.md))

### 7. Refactor propose and critique onto hamilton-grilling

**Destination contribution:** Makes dialogue a shared protocol while preserving propose's gates and
critique's judge-don't-fix boundary.

**Goal:** Delegate propose's three dialogue surfaces and add critique validation only on its
`changes-requested` path.

**Done when**

- Attended sessions invoke grilling at the specified call sites and unattended sessions retain
  their documented fallback.
- Critique still does not edit proposal artifacts and writes only validated findings.

**Binding constraints**

- Grilling remains HITL and critique's dialogue occurs before `critique.md` is written. ([Update propose and critique to use hamilton-grilling](tickets/12-propose-and-critique-use-grilling.md))

### 8. Teach propose to read a route

**Destination contribution:** Connects a cleared Wayfinder route to the per-change propose entrypoint.

**Goal:** Have propose locate the next pending unit in a pointed-at map folder, read its linked
  decisions, and then continue with its existing workflow.

**Done when**

- Pointing propose at a map folder selects the next pending route unit and loads its ticket context.
- Route reading is branch-local and all post-entrypoint propose behavior remains unchanged.

**Binding constraints**

- Every unit goes through propose; it reads the route from the session's starting branch, not the
  default branch. ([Boundary with hamilton-propose and hamilton-critique](tickets/09-boundary-with-propose-and-critique.md), [Where map artifacts live relative to per-unit worktrees](tickets/13-map-artifacts-and-worktrees.md))

### 9. Sync the framework docs

**Destination contribution:** Makes Wayfinder's optional pre-change position and provenance visible
in Hamilton's contributor and skill documentation.

**Goal:** Add the Wayfinder entry and map-artifact mapping without changing the fixed six-skill core
narrative.

**Done when**

- `docs/skills.md` presents Wayfinder before propose as optional and links its fork provenance.
- `CONTRIBUTING.md` maps changes under `.hamilton/maps/` to the owning documentation.

**Binding constraints**

- The documentation scope is limited to `docs/skills.md` and `CONTRIBUTING.md`; the framework
  diagram remains unchanged. ([How the framework docs present the pre-SDD stage](tickets/10-framework-docs-presentation.md))

### 10. Convert the map's own files to the mechanics contract

**Destination contribution:** Dogfoods the settled frontmatter mechanics on the map and all thirteen
current tickets.

**Goal:** Convert the map's loose metadata to YAML frontmatter and give the mechanics contract a
stable written home.

**Done when**

- `map.md` and every ticket use the agreed frontmatter fields and lifecycle values.
- The mechanics contract is documented without changing the map's decision content.

**Binding constraints**

- The contract's documentation home is chosen during propose; conversion preserves all current
  answers and map structure. ([Map mechanics in files](tickets/04-map-mechanics-in-files.md))
