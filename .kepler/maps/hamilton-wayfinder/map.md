---
status: shipped
---

# Fork wayfinder into Hamilton

## Destination

`skills/hamilton-wayfinder/` — plus the ported sibling skills it needs and the synced framework
docs — authored and merged to `main`, so Hamilton has a pre-SDD stage that refines a loose goal
into change-sized units the SDD loop implements.

The map reaches the destination *through* Hamilton's own loop: when the decisions below are
settled, `route.md` names the change-sized units, and each unit runs
`hamilton-propose → plan → code → review → finish-work`.

## Notes

**Domain:** Hamilton's own repository — skill authoring, artifact conventions, framework docs.
Read `AGENTS.md`, `CONTRIBUTING.md`, `docs/sdd-framework.md` and `docs/skills.md` before
resolving any ticket. Upstream source is
[mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering) (MIT).

**This map carries execution** — overriding wayfinder's "plan, don't do" default. The destination
is a merged fork, not a set of decisions. Execution is delegated to the SDD loop via `route.md`,
not performed inside the tickets.

**Standing decisions from charting** (2026-08-04) — these frame every ticket and are not up for
re-litigation without redrawing the destination:

- **File-native, mechanics isolated.** The map and its tickets are markdown under `.hamilton/`.
  No tracker indirection, no external config doc. Tracker mechanics live in one clearly-bounded
  `## Map mechanics` section so a later change can swap them.
- **Route handoff.** A cleared map produces a `route.md` naming change-sized units in order, each
  linking the decisions that back it. Wayfinder does not scaffold change directories itself.
- **Port the siblings.** `research`, `prototype` and `domain-modeling` come into Hamilton
  alongside the fork rather than being inlined or soft-depended on.

**Layout is settled.** `.hamilton/maps/<effort>/` holding `map.md`, `route.md` and
`tickets/NN-slug.md` — decided in
[Map artifact layout under .hamilton/](tickets/01-map-artifact-layout.md), which confirmed this
map's provisional guess rather than moving it. Dogfooding is deliberate: the fork's first user is
its own fork.

**Skills every session should consult:** `/grilling` for the decision tickets.

## Decisions so far

<!-- one line per closed ticket: enough to judge relevance, then open the link for the detail -->

- [Map artifact layout under .hamilton/](tickets/01-map-artifact-layout.md) — `.hamilton/maps/<effort>/`
  as a third sibling to `specs/` and `changes/`, undated slug, `tickets/NN-slug.md`, no asset
  directory. `hamilton-init` does not scaffold it; a cleared map stays in place, marked. Nothing
  relocates — the provisional guess is now the convention.
- [Read the three upstream sibling skills](tickets/02-read-upstream-siblings.md) — all three are small
  (research 12 lines, prototype 217, domain-modeling 181) and MIT. `research` ports clean; `prototype`
  assumes an issue to hang its context pointer on; `domain-modeling` is the real collision — it writes
  a root `CONTEXT.md` glossary and numbered `docs/adr/` records, a durable-truth system parallel to
  `.hamilton/specs/`.
- [Fork attribution and licensing](tickets/03-fork-attribution.md) — Hamilton had **no licence at
  all**; it adopts **Apache 2.0**. Upstream credit is formal, not prose: `LICENSE` + `NOTICE` at the
  root, plus a `NOTICE` inside every forked skill directory, because the skill directory — not the
  repo — is the unit of distribution. `Copyright 2026 Caio Ferreira`, no per-file headers, and the
  Inspirations section stays untouched.
- [Map mechanics in files](tickets/04-map-mechanics-in-files.md) — **YAML frontmatter** with
  `type`, `status`, `blocked_by`. Claiming stays (signals intent, doesn't prevent collision).
  Status values: `open` / `resolved` for tickets, `open` / `cleared` for maps. `## Map mechanics`
  section documents the frontmatter contract for future tracker backends.
- [Template convention](tickets/05-template-convention.md) — All three shapes (`map.md`, `ticket.md`,
  `route.md`) go into `bundle/templates/wayfinder/`. Wayfinder depends on `hamilton setup` having been
  run first; dependency is documented, not guarded. Test and docs updates in the route.
- [Route shape and the SDD join](tickets/06-route-shape-and-sdd-join.md) — `route.md` is a static
  handoff document listing change-sized units in order with dependencies. Each unit: name, goal
  (paragraph), decision links, ordering/dependencies, entry point. Implementers follow links; route.md
  does not restate. Route tracks unit completion. Map status: `cleared` → `shipping` → `shipped`.
- [Which siblings to port, and their Hamilton shape](tickets/07-which-siblings-to-port.md) — All three
  ported under `hamilton-wayfinder-*` prefix, internal to wayfinder only. Grilling ports separately as
  `hamilton-grilling` (general-purpose), and propose/critique refactored to use it. Research findings
  to `.hamilton/maps/hamilton-wayfinder/research/`, prototypes linked from ticket bodies, domain-modeling
  glossary to `.hamilton/maps/hamilton-wayfinder/glossary.md` with hard decisions in ticket Answers. Map
  gains working glossary section; first route unit is glossary finalization.
- [Ticket types in the Hamilton fork](tickets/08-ticket-types.md) — All four upstream types survive
  (`research`, `prototype`, `grilling`, `task`). Type name recorded in YAML frontmatter. Wayfinder keeps
  strict HITL rule for planning phase; Hamilton's three-tier model applies to SDD execution, not planning.
- [Boundary with hamilton-propose and hamilton-critique](tickets/09-boundary-with-propose-and-critique.md) — One change = one session. Wayfinder breaks complex goals into clear units; propose transforms units into concrete specs. Propose gains map-aware behavior (reads route.md, finds next unit, pulls context). Every unit goes through propose; no critique equivalent for maps.
- [How the framework docs present the pre-SDD stage](tickets/10-framework-docs-presentation.md) — Wayfinder sits before propose (optional). Update docs/skills.md and CONTRIBUTING.md only. Pipeline: "six core skills plus optional pre-change planning stage." Map artifacts row in CONTRIBUTING.md. Fork provenance narrative in skills.md entry.
- [Update propose and critique to use hamilton-grilling](tickets/12-propose-and-critique-use-grilling.md) —
  Called as a skill. Grilling ports near-verbatim and owns the protocol only; callers own question
  content and exit condition. Propose delegates at all three surfaces (steps 4, 7, 10). Critique had
  **no** dialogue — correcting ticket 07's premise — and gains it on the `changes-requested` path,
  between the rubric and the report, so "Judge, don't fix" survives. Attendance is guarded at the call
  site; grilling never gains an unattended mode. No test coverage needed. Retyped `task` → `grilling`.
- [Where map artifacts live relative to per-unit worktrees](tickets/13-map-artifacts-and-worktrees.md) —
  The `route.md` status flip **rides the unit's own branch** and lands on the default branch when the
  unit merges. `.hamilton/maps/` is ordinary repo content, no exception to propose's worktree gate.
  Between-merge staleness accepted, matching the claiming mechanic. The map's own
  `cleared`/`shipping`/`shipped` transitions follow the same rule.
- [Compose route.md — the change-sized units](tickets/11-compose-route.md) — [`route.md`](route.md)
  written: **ten units**, all entering at `hamilton-propose`. Units 1–3 (glossary, licensing,
  templates) are takeable in parallel; everything narrows onto unit 6, which authors the skill itself.
  Five units the ticket did not predict came from decisions resolved after it was charted. Recorded
  two findings: the working glossary ticket 07 assumed **never existed**, so unit 1 harvests terms from
  ticket Answers instead of merging a file; and the per-unit "suggested entry" field is a constant
  since ticket 09 made propose mandatory. **The map is `cleared`.**

## The route

[`route.md`](route.md) holds the handoff. Each unit runs
`hamilton-propose → plan → code → review → finish-work` and flips its own status on its own branch.
The map moves to `shipping` when the first unit starts and `shipped` when the last one merges.

## Not yet specified

**Clear.** Every patch charted here has graduated into a decision or been ruled out of scope:

- *Worktrees and branching* → [Where map artifacts live relative to per-unit worktrees](tickets/13-map-artifacts-and-worktrees.md).
- *Concurrency and claiming* → answered by [Map mechanics in files](tickets/04-map-mechanics-in-files.md)
  (claiming stays; signals intent, doesn't prevent collision) and the divergent-copies half by ticket 13.
- *CLI surface* → ruled out of scope, below.
- *Test impact* → answered by [Template convention](tickets/05-template-convention.md); the
  `setup.test.ts` assertions ride the "land the templates" route unit rather than earning a ticket.
- *Existing skills' awareness* → answered by [Boundary with hamilton-propose and hamilton-critique](tickets/09-boundary-with-propose-and-critique.md)
  (propose gains map-aware entrypoint logic).

## Out of scope

- **Tracker pluggability** — GitHub/GitLab backends for the map. Ruled out at charting; the fork
  ships file-native with mechanics isolated so a later effort can add them.
- **CLI surface for maps** — a `hamilton` subcommand to scaffold a map or query the frontier. Ruled
  out while clearing the fog for [Compose route.md](tickets/11-compose-route.md). `hamilton` is a
  template-installer with one subcommand (`setup`); no command scaffolds a change directory either —
  `hamilton-propose` does that itself — so a map command would be the first to break that pattern. A
  frontier query is a `grep` over a dozen files in one directory. The destination names a skill, its
  ported siblings, and synced docs; a CLI command sits past that line and drags new tests and docs
  behind it. Returns as a fresh effort if using the fork proves the ergonomics bad.
- **Porting the rest of the upstream engineering skills** — `to-tickets`, `triage`, `to-spec`,
  `code-review`, `tdd`, `implement`, and the others. Only the three siblings wayfinder actually
  delegates to are in scope.
- **Prototype skill improvements** — The prototype skill as ported serves wayfinder's needs, but
  for Hamilton's broader user base, enhancements could include better integration with Hamilton's
  change-directory model, improved artifacts guidance, and UI/LOGIC branch guidance. This is future
  work outside the scope of the fork decision.
