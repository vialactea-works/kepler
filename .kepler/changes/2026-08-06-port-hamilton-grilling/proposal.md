# Proposal: Port hamilton-grilling

| Field   | Value                                   |
|---------|-----------------------------------------|
| Change  | 2026-08-06-port-hamilton-grilling       |
| Status  | draft                                   |
| Author  | agent (hamilton-propose)                |
| Created | 2026-08-06                              |

## Why

Three units still ahead on the [hamilton-wayfinder route](../../maps/hamilton-wayfinder/route.md) need the same thing: a way to put open decisions to a human one at a time instead of guessing at them. [Propose and critique use grilling](../../maps/hamilton-wayfinder/tickets/12-propose-and-critique-use-grilling.md) settled that they reach for a shared skill rather than each restating the protocol, and [Which siblings to port](../../maps/hamilton-wayfinder/tickets/07-which-siblings-to-port.md) placed that skill at the Hamilton level rather than inside wayfinder, precisely because more than one caller wants it. Nothing in the repository provides it yet. Until it exists, units 6, 7 and 8 have nothing to call, and each would otherwise grow its own copy of a protocol that is identical in all three places.

## Goals & Success Criteria

- `skills/hamilton-grilling/` exists and holds the upstream grilling protocol, reachable both by a person invoking it directly and by another skill invoking it by name.
- The skill body is the upstream text, unmodified — a reader diffing it against `mattpocock/skills`' `grilling/SKILL.md` finds the instruction paragraphs identical.
- The skill owns the dialogue protocol and nothing else: it names no approach, artifact, finding, or pipeline step, so any caller can use it without inheriting wayfinder's or the pipeline's vocabulary.
- Attribution travels with the directory: a sibling `NOTICE` carrying upstream's terms, and a one-line provenance pointer in `SKILL.md`, exactly as `CONTRIBUTING.md` prescribes.
- Route unit 4 reads `shipped`, flipped in this change's own diff.

## Non-Goals

- **No call sites.** Nothing in this change invokes `hamilton-grilling`. Propose and critique gain their call sites in unit 7; wayfinder's grilling ticket type is unit 6. This change ships the callee alone.
- **No documentation entry.** `docs/skills.md` gains no `hamilton-grilling` entry here — see Impact for the consequence.
- **No unattended mode.** Grilling keeps exactly one behavior. The attendance check belongs at the call site, per ticket 12, and is therefore unit 7's work.
- **No trimming or restructuring of the upstream body.** The route's porting rule governs; see Proposed Change.
- **No tests.** `skills/` is not part of `bundle/`, `hamilton setup` never installs it, and no test in the repository asserts on skill content.
- **No change to the root `NOTICE`.** It is un-enumerated by design.

## Proposed Change

A new skill directory, `skills/hamilton-grilling/`, holding two files.

`SKILL.md` carries YAML frontmatter — `name` and `description` — followed by the upstream grilling body verbatim and a one-line provenance pointer. The body is the protocol and only the protocol: interview relentlessly down each branch of the decision tree, one question at a time waiting for each answer, leading every question with a recommended answer, looking facts up in the environment rather than asking, leaving the decisions to the human, and not acting until the human confirms a shared understanding. Callers supply the question content and decide when the dialogue ends.

`NOTICE` sits beside it, instantiated from the template in `CONTRIBUTING.md`, naming the upstream skill and project and reproducing upstream's MIT terms alongside Hamilton's own modification copyright.

The port is verbatim by rule. [Which siblings to port](../../maps/hamilton-wayfinder/tickets/07-which-siblings-to-port.md) requires ports be full rather than trimmed, and the route confines edits to the adaptation surface — frontmatter, description, invocation mode, naming, the provenance line, and re-homed paths. Three consequences follow, each settled in dialogue during this proposal:

The closing instruction — not acting until the human confirms shared understanding — **ports verbatim**. It is a don't-act-yet rule rather than a loop-termination rule, so it coexists with ticket 12's assignment of the exit condition to the caller, and it is the guarantee that stops an agent answering its own questions.

The upstream `agents/openai.yaml` sidecar is **dropped**. It is packaging metadata for a different agent host's interface, not part of the protocol, and no Hamilton skill ships one.

The upstream `description` **ports verbatim**, by explicit decision, rather than taking the pruning the route's craft focus calls for. This is recorded as a deliberate deviation in the design's Quality Lens.

The skill is **model-invoked** — it sets no `disable-model-invocation`, matching every existing Hamilton skill. This is forced rather than chosen: that flag strips a skill from other skills' reach as well as the agent's, and units 6, 7 and 8 all need to reach this one.

Finally, unit 4's row in `route.md` flips from `pending` to `shipped`, in this change's own diff, per the route's standing rule.

## Capabilities

### New

- `dialogue`: the human-in-the-loop questioning protocol — one question at a time, recommendation-led, facts looked up rather than asked, the human's side never answered for them, and no action before the human confirms.

### Modified

None. `licensing` already carries the rule this change obeys — every forked skill directory ships a sibling `NOTICE`, and the root notice is un-enumerated so a new fork never edits it. This change instantiates that contract rather than altering it, which is the spec working as intended.

## Impact

New files only: `skills/hamilton-grilling/SKILL.md` and `skills/hamilton-grilling/NOTICE`, plus the status flip in `.hamilton/maps/hamilton-wayfinder/route.md`. No existing file changes behavior, no code is touched, and no dependency moves. `bun run build` type-checks TypeScript and is unaffected; the suite has nothing to assert against markdown under `skills/`.

**One gap is knowingly accepted.** `docs/skills.md` documents each of the nine existing skills in a fixed When / Inputs / Produces / Notes / Source format. This change adds a tenth skill and no entry for it, so on merge the repository documents nine of ten. Documenting it was deferred to unit 9 — but [Framework docs presentation](../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md) scopes unit 9 to the wayfinder entry plus one `CONTRIBUTING.md` row and does not mention grilling, so unit 9's scope has to be widened when it is proposed or the gap persists past the map. This is the single follow-up this change leaves behind.

A second, smaller inheritance for unit 7: `docs/skills.md` says in its `hamilton-review` notes that the driver re-invokes `hamilton-code` because the skills do not call each other. It reads today as a general property of Hamilton's skills, and it stays true on this change's merge since nothing calls grilling yet. Unit 7 makes it false by giving propose and critique a call site. Correcting or narrowing it belongs there, with the change that falsifies it.
