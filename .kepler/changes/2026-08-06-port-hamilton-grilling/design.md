# Design: Port hamilton-grilling

## Context

Hamilton has nine skills under `skills/`, each a directory holding `SKILL.md` and optionally `references/`. Every one is Hamilton's own work; **none is a fork**, none carries a `NOTICE`, and the string "adapted from" appears nowhere in the tree. This change lands the repository's first forked skill directory, so whatever shape it takes is the pattern the three wayfinder ports in units 5 through 8 will copy.

The ground rules are already fixed elsewhere and this design does not revisit them. [Fork attribution and licensing](../../maps/hamilton-wayfinder/tickets/03-fork-attribution.md) settles that credit is formal rather than prose and lands at two levels, with the full permission text in a sibling `NOTICE` and a one-line pointer in `SKILL.md` — explicitly not in `references/`, which in this repository means agent reading material, and explicitly not as a licence block in the body, which would be a context tax on every invocation. [`.hamilton/specs/licensing.md`](../../specs/licensing.md) carries that as a standing invariant, and `CONTRIBUTING.md` carries the copy-pasteable template. [Which siblings to port](../../maps/hamilton-wayfinder/tickets/07-which-siblings-to-port.md) fixes the name `hamilton-grilling`, standalone rather than under the `hamilton-wayfinder-*` prefix, and requires a full port rather than a trimmed one. [Propose and critique use grilling](../../maps/hamilton-wayfinder/tickets/12-propose-and-critique-use-grilling.md) fixes the boundary: the skill owns the protocol, the caller owns the question content and the exit condition.

The upstream source is the `grilling` skill from [mattpocock/skills](https://github.com/mattpocock/skills), installed locally at `~/.claude/skills/grilling/`. It is four short instruction paragraphs plus frontmatter, with one sidecar file, `agents/openai.yaml`, carrying a display name and short description for a different agent host.

Two constraints on verification are worth stating up front, because they shape the testing strategy more than anything else. `skills/` is not part of `bundle/`, `hamilton setup` never installs it, and no test in the repository asserts on skill content — so the suite has nothing to say about this change. And `bun run build` type-checks TypeScript, which this change does not touch.

## Goals / Non-Goals

**Goals**

- Land `skills/hamilton-grilling/` as a self-contained, self-attributing unit that stays correct when detached from the repository.
- Preserve the upstream protocol text exactly, so the fork remains diffable against upstream in both directions.
- Keep the skill reachable by other skills, since that is the reason it exists as a shared skill rather than as three copies.
- Establish a fork shape units 5 through 8 can follow without re-deciding anything.

**Non-Goals**

- No call sites, no attendance handling, no unattended mode — all unit 7's work.
- No `docs/skills.md` entry; deferred, with the consequence recorded under Risks.
- No test scaffolding for skill content. Introducing an assertion framework for markdown to cover one file would be a larger and worse change than the one being made.

## Decisions

### Decision: The skill body is upstream's text, unmodified

- Choice: the four instruction paragraphs are copied byte-for-byte from upstream's `grilling/SKILL.md`. Edits are confined to the adaptation surface the route names — frontmatter, description, invocation mode, naming, the provenance line, and re-homed paths — and in this port only the frontmatter `name` and the appended provenance line actually differ.
- Alternatives considered: **trimming to the protocol Hamilton's callers use** — rejected because ticket 07 requires full ports and says to trim later if needed; **rewriting in Hamilton's own voice** to match the nine sibling skills' register — rejected because it discards the diffability that makes a fork traceable, and because it would relicense text Hamilton did not write.
- Rationale: the port rule exists so that upstream improvements can be pulled forward and Hamilton's divergence can be seen at a glance. Every unforced edit erodes that.

### Decision: The closing don't-act instruction ports verbatim

- Choice: upstream's final sentence — that the agent must not act until the human confirms shared understanding — stays exactly as written.
- Alternatives considered: **cutting it**, on the reading that ticket 12 assigns the exit condition to the caller and the skill must own the protocol only; **rewording it** to point at the caller's exit condition explicitly.
- Rationale: it is a don't-act-yet rule, not a loop-termination rule. It constrains whether the agent may start building, while ticket 12's exit condition governs which question ends the dialogue — the two are orthogonal and both hold. Cutting it would remove the only thing in the protocol that stops an agent answering its own questions and proceeding, which is precisely the HITL failure the glossary names. Confirmed in dialogue during this proposal.

### Decision: The `agents/openai.yaml` sidecar is dropped

- Choice: only `SKILL.md` and `NOTICE` ship.
- Alternatives considered: **porting it with names adapted**, as the most literal reading of a verbatim port; **porting it unchanged**, which would render the skill under its old name and short description.
- Rationale: it is packaging metadata for another agent host's interface, not protocol instruction. The verbatim rule governs the text the agent reads. No Hamilton skill ships one, so including it would create an untested, undocumented one-off that every subsequent fork then has to decide about. Dropping it changes no specified behavior.

### Decision: The description ports verbatim, against the route's craft focus

- Choice: upstream's `description` is carried over unchanged.
- Alternatives considered: two pruned rewrites — one keeping upstream's leading word and one replacing it — each collapsing upstream's two overlapping trigger clauses into one branch and adding a branch for skill-to-skill reach.
- Rationale: **user decision, overriding the route's stated craft focus for this unit.** The route directs that a model-invoked skill's description take harder pruning because it is permanent context load. The accepted counter-argument is that the description demonstrably works upstream under the same invocation model. The practical cost is small: units 6 through 8 will invoke `hamilton-grilling` by name rather than by trigger match, so the missing skill-to-skill branch does not impede the callers it was flagged for. Recorded again under Quality Lens as a deliberate deviation.

### Decision: Model-invoked, with no `disable-model-invocation`

- Choice: frontmatter carries `name` and `description` only, matching all nine existing skills.
- Alternatives considered: **`disable-model-invocation: true`**, which would keep the description out of permanent context.
- Rationale: forced rather than chosen. That flag removes a skill from other skills' reach as well as the agent's, and skill-to-skill reach is the entire reason this capability was placed at the Hamilton level instead of inside wayfinder.

### Decision: The provenance pointer is a trailing line

- Choice: frontmatter, then the upstream body, then a blank line and the one-line pointer at the foot of the file.
- Alternatives considered: **a leading line** immediately after the frontmatter; **a frontmatter field** — the latter ruled out by ticket 03, which specifies a line in `SKILL.md` and not a machine-readable key, and by the nine skills' `name`/`description`-only convention.
- Rationale: ticket 03 settles placement at file granularity but not position within the file, so this is a genuine but small choice. Grilling's body *is* the instruction, written in sustained second person from its first word; nothing should stand between the frontmatter and that word. Foot placement also keeps the pointer out of the context an agent loads before reaching the payload. The `NOTICE` is what discharges the licence obligation, so the line's position carries no legal weight.

### Decision: The `NOTICE` is instantiated from the `CONTRIBUTING.md` template

- Choice: copy the template block from `CONTRIBUTING.md`, substituting the upstream skill name `grilling` and the project `mattpocock/skills` with its URL.
- Alternatives considered: **copying from the root `NOTICE`** — rejected because `.hamilton/specs/licensing.md` states no copy is derived from another copy; every copy instantiates the one template.
- Rationale: the licensing spec requires reproduced permission text be copied rather than reconstructed from memory, and names the template as the sanctioned instantiation path tracing back to upstream as authoritative origin. The upstream skill directory installed locally carries no `LICENSE` file of its own, so the template is the correct source here rather than a convenience.

## Architecture & Components

Two files, no code, no wiring.

| Unit | Responsibility | Interface | Depends on |
|------|----------------|-----------|------------|
| `skills/hamilton-grilling/SKILL.md` | states the dialogue protocol and nothing else | its `name` (how callers reach it) and `description` (how the agent decides to reach it) | nothing — no reference files, no repository paths, no Hamilton vocabulary |
| `skills/hamilton-grilling/NOTICE` | carries upstream's copyright and permission text plus Hamilton's modification copyright | read by a human or a licence scanner; never loaded into agent context | nothing |

The unit's defining property is that it has no dependencies at all — not on `.hamilton/`, not on the pipeline, not on wayfinder. That is what makes it callable from three unrelated places, and it is the property to protect in review.

A third file changes: `.hamilton/maps/hamilton-wayfinder/route.md`, where unit 4's status flips from `pending` to `shipped`. This is route bookkeeping rather than part of the capability, and per the route's standing rule it rides this change's own diff so the default branch never claims `shipped` for work that has not landed.

### Quality Lens

**Responsibility.** `SKILL.md` has exactly one reason to change: the dialogue protocol changes. `NOTICE` has exactly one: the upstream provenance changes. Neither can be described with an "and". The protocol-only boundary is what enforces this — the moment the skill named an approach, an artifact, a finding, or a pipeline step, it would acquire a second reason to change, one per caller. That is the structural risk in this change and the requirement *The protocol is caller-agnostic* is what review should check it against.

**Boundaries and dependencies.** The skill hides nothing because it holds no state and no mechanism; its whole surface is its text. It depends on no abstraction because it depends on nothing. Inversion is not applicable and adding a seam would be inventing structure to satisfy a rubric.

**Right-sizing — what was deliberately not added.** No `references/` directory, though seven of nine sibling skills have one: there is no material a caller must read beyond the protocol itself, and ticket 03 explicitly rules `references/` out as a home for the licence. No configuration or parameterisation for callers, though three callers with different subject matter are coming: ticket 12 assigns question content and exit condition to the caller, so a parameter surface here would be the wrong place for both. No unattended fallback, though being model-invoked means an unattended agent could fire it and stall: ticket 12 places the attendance check at the call site and states grilling never gains a second mode, so the fallback belongs in unit 7.

**Accepted deviations.** Two, both deliberate, both cross-listed under Risks.

The description ports verbatim rather than taking the pruning the route's craft focus mandates for this unit. This is a user decision overriding a route instruction, recorded rather than silently absorbed.

`hamilton-grilling` ships undocumented. `docs/skills.md` will describe nine of ten skills on merge, and unit 9's ticket does not cover the tenth.

Neither is a structural smell — no unit gains a second reason to change, no boundary leaks, no dependency is hard-wired. The change adds two leaf files with no inbound or outbound edges.

## Data & Flow

None. No data model, no control flow, no runtime behavior. The artifact is text loaded into an agent's context.

## Error Handling & Edge Cases

| Failure | Behavior |
|---------|----------|
| The skill is invoked with no human present | Out of scope by decision: ticket 12 places the attendance check at the call site, and unit 7 adds it. Grilling itself has one behavior and stalls waiting for an answer, which is the correct behavior for a HITL primitive. |
| A caller supplies no exit condition | The dialogue does not self-terminate. This is the specified division of responsibility, not a defect. |
| The skill directory is copied out of the repository | It stays compliant — the `NOTICE` travels with it, which is the whole reason for the two-level scheme. |

## Testing Strategy

**No automated tests.** Ticket 12 records this directly: `skills/` is not part of `bundle/`, `hamilton setup` never installs it, and no test in the repository asserts on skill content. Adding a markdown-assertion harness to cover one forked file would be a larger and more speculative change than the port itself, and would set a precedent for the nine existing skills that nobody has asked for.

Verification is therefore by inspection, and the acceptance criteria are the requirement scenarios in [`requirements/dialogue.md`](requirements/dialogue.md):

- Diff the ported instruction paragraphs against `~/.claude/skills/grilling/SKILL.md`. They must be identical; differences confined to the adaptation surface. This is the check for *The protocol text is upstream's, unmodified* and it is mechanical — run it, do not eyeball it.
- Read `SKILL.md` for any mention of an approach, artifact, finding, pipeline step, or wayfinder term. There must be none. This is the check for *The protocol is caller-agnostic*.
- Confirm the frontmatter carries `name` and `description` only, with no `disable-model-invocation`. This is the check for *Reachable by other skills*.
- Diff the `NOTICE`'s permission block against the template in `CONTRIBUTING.md`. It must match apart from the substituted skill and project names.
- Confirm `bun run build` still passes and the suite is green — both are unaffected by construction, so this confirms the change touched nothing it should not have.

## Constraints & Boundaries

- Always: instantiate the `NOTICE` by copying the `CONTRIBUTING.md` template rather than typing the permission text; flip unit 4's route status in this change's own diff; run `bun run build` and the suite before committing, even though neither exercises the change.
- Ask first: any edit to the upstream instruction paragraphs beyond the adaptation surface; any addition of a `references/` file; any change to `docs/skills.md`, the root `NOTICE`, or `CONTRIBUTING.md`, all of which are settled elsewhere and out of scope here.
- Never: reconstruct the MIT permission text from memory; place licence text in `references/` or in the `SKILL.md` body; set `disable-model-invocation`; add a call site in any other skill; name the upstream sidecar or port it.

## Risks / Trade-offs

- **`hamilton-grilling` ships undocumented** -> `docs/skills.md` covers nine of ten skills on merge. Mitigation: recorded in the proposal's Impact as the change's one follow-up. Unit 9's scope must be widened when it is proposed, since [ticket 10](../../maps/hamilton-wayfinder/tickets/10-framework-docs-presentation.md) scopes it to the wayfinder entry and does not mention grilling. Left unaddressed, the gap outlives the map.
- **The description is not pruned as the route directs** -> permanent context load slightly higher than the route intended, and no trigger branch for skill-to-skill reach. Mitigation: callers invoke by name rather than by trigger match, so the missing branch does not block them. Revisit if a caller is ever observed failing to reach the skill.
- **`docs/skills.md` says the skills do not call each other** -> stated in `hamilton-review`'s notes but read as a general property; still true on this merge, false once unit 7 gives propose and critique a call site. Mitigation: deliberately left to unit 7, which is the change that falsifies it; correcting it now would document behavior that does not yet exist.
- **No test can detect a later drift from upstream** -> a future edit could silently break the verbatim guarantee. Mitigation: accepted. The `NOTICE` records the provenance, so the diff remains reproducible by hand; automating it is disproportionate for four paragraphs.
- **This change sets the fork precedent for units 5 through 8** -> a poor shape here propagates three times. Mitigation: the shape is almost entirely dictated by ticket 03 and `CONTRIBUTING.md`; the only free choice is the pointer's position within the file, which is cheap to change later.

## Migration / Rollout

None. Two new files and a one-word status flip; nothing to migrate, nothing to roll back beyond reverting the commit.
