# Design: Port the three wayfinder siblings

## Context

Route unit 5 asks for three upstream skills — `research`, `prototype` and `domain-modeling` from [mattpocock/skills](https://github.com/mattpocock/skills) — to be forked into `skills/hamilton-wayfinder-research/`, `skills/hamilton-wayfinder-prototype/` and `skills/hamilton-wayfinder-domain-modeling/`. Unit 4 already forked `grilling` the same way, so the mechanics are settled: a directory holding `SKILL.md` and a sibling `NOTICE`, with a one-line provenance pointer in the `SKILL.md` body. `grilling` carried no reference files, so two of these three ports are the first to face where ported reference material sits.

What is not mechanical is the adaptation. The route preamble binds every port in this effort to a **verbatim rule**: upstream text is copied byte-for-byte, and edits are confined to the **adaptation surface** — frontmatter, description, invocation mode, naming, the provenance line, and the re-homed paths. Two of these three skills write durable artifacts, and both assume a world Hamilton does not have. `research` saves its findings "where the repo already keeps such notes" and names no fallback. `prototype` hangs a context pointer on an issue in a tracker Hamilton deliberately replaced with files. `domain-modeling` maintains a second durable-truth system — a root `CONTEXT.md` glossary plus numbered records under `docs/adr/` — standing directly across from `.hamilton/specs/`. Re-homing those three destinations is the whole of the design work; everything else is transcription.

The change also inherits a boundary question. `.hamilton/specs/glossary.md` already defines the wayfinder vocabulary, and unit 6 will specify how a map is charted and worked. These ports sit between the two, and the capability they land has to not overlap either.

## Goals / Non-Goals

Goals and non-goals are stated in [proposal.md](proposal.md) and are not restated here. The design-level goal this document adds: make the verbatim rule **checkable from inside the repository**, so a reader six months from now can confirm no upstream prose was quietly improved without fetching a moving remote and diffing by hand.

## Decisions

### Decision: Model-invoked, with upstream's descriptions kept verbatim

- Choice: all three skills omit `disable-model-invocation` and keep upstream's `description` field word-for-word, including its general trigger phrasing.
- Alternatives considered: (a) user-invoked, which would cost zero context load and keep the skills undiscoverable outside wayfinder, matching ticket 07's stated intent; (b) model-invoked but with the description narrowed to wayfinder-specific triggers, which would keep them reachable while suppressing the stray firings.
- Rationale: (a) is disqualified outright — a user-invoked skill is reachable only by a person typing its name, and *no other skill can reach it*, which would leave unit 6 unable to invoke any of the three. That is the same reasoning that settled `dialogue`'s invariant in unit 4, and it is now a standing property of this repo's forked protocols. (b) is tempting and would genuinely reduce misfires. The route's surface does name the description, so narrowing it is permitted rather than forbidden — but permitted is not obligatory, and this change declines to exercise it. Rewriting the trigger list is exactly the kind of quiet improvement the verbatim rule exists to discourage everywhere else, and it would make the fork undiffable in the one field a reader is least likely to check. The surface is exercised for the skill's own name and nothing else. The accepted cost is recorded under Risks.

### Decision: Land each port verbatim first, then adapt in a second commit

- Choice: each skill ships in two commits — one placing the upstream files byte-identical (together with the sibling `NOTICE`), and one applying only the adaptation surface.
- Alternatives considered: one commit per skill, matching unit 4's shape; or two tasks split by adaptation weight, bundling the two light ports together.
- Rationale: the verbatim rule is this change's hardest invariant and the one most expensive to re-verify later, because upstream is a moving target — a diff run next year compares against whatever upstream has become, not against what was forked. Splitting the commit turns the adaptation into a git artifact: `git show` on the second commit of a pair *is* the complete list of departures from upstream, provable in one command with no network. The cost is six tasks instead of three and one intermediate commit per skill in which the skill is not yet coherent inside Hamilton. That intermediate state is acceptable because nothing invokes these skills until unit 6, so no consumer observes it.

### Decision: Re-home the three artifact destinations onto the map

- Choice: research findings go to `.hamilton/maps/<effort>/research/`; a prototype's context pointer goes in the resolving ticket's body with the verdict in its `## Answer`; the working glossary goes to `.hamilton/maps/<effort>/glossary.md` and a qualifying decision into the resolving ticket's `## Answer`.
- Alternatives considered: leaving upstream's destinations in place and letting each effort decide; or routing `domain-modeling`'s glossary straight to `.hamilton/specs/glossary.md`.
- Rationale: leaving them in place is what makes the skills incoherent — upstream's `research` names no fallback at all, so "leave it" means the artifact has no home. Routing to `.hamilton/specs/` is worse: the canonical specs are synced at finish-work from a change's deliberate artifacts, and a skill writing into them mid-session would bypass that pipeline entirely. The map is the correct home because it is exactly the artifact that spans several changes and outlives all of them, which is what a working glossary and a research finding both need. `.hamilton/specs/glossary.md` stays the harvest destination, reached deliberately and only once.

### Decision: Both format guides ship whole; only their destination changes

- Choice: `prototype/UI.md`, `domain-modeling/CONTEXT-FORMAT.md` and `domain-modeling/ADR-FORMAT.md` are ported complete — every section survives, none is dropped. `ADR-FORMAT.md` keeps its whole template and its `## When to offer an ADR` bar. Where a section names the upstream destination, that destination is patched in place with the smallest edit that re-homes it: `ADR-FORMAT.md`'s `## Numbering` states that the resolving ticket's own number identifies the decision, and `CONTEXT-FORMAT.md`'s paths become the two-level glossary. A section is re-pointed, never deleted and never rewritten for style.
- Alternatives considered: trimming `ADR-FORMAT.md` to just its three-part qualifying bar, on the grounds that the numbering and file-layout sections are dead once the output is re-homed into a ticket; or shipping those sections byte-identical and accepting that they describe a `docs/adr/` this repository never creates.
- Rationale: the trim is superficially attractive and structurally wrong. It is a judgement about which parts of an upstream skill are useful, made before a single ticket has been resolved with it — the exact judgement ticket 07 deferred by choosing to start "with the complete toolkit". The verbatim rule forbids it. What that rule does not forbid is re-pointing a section that names the old destination: a re-homed path sits on the adaptation surface wherever it appears, body prose included, and a section made inert *by the re-homing itself* is the re-homing's own business to finish. Shipping it byte-identical would leave a reader instructions to create a directory this repository does not have, which is a worse outcome than a three-line patch and is not what the verbatim rule is protecting.

### Decision: One capability, `ticket-resolution`, bounded against two neighbours

- Choice: all of this change's requirements land in `requirements/ticket-resolution.md`. It specifies what each resolving procedure guarantees and where its artifact comes to rest — nothing about the map's structure or how a ticket is chosen.
- Alternatives considered: three capabilities, one per skill; or folding these requirements into `glossary`.
- Rationale: three capabilities would be per-skill shards of one durable domain, and would multiply files through the whole pipeline for no gain — the same over-splitting the propose step warns against. Folding into `glossary` is wrong in the other direction: `glossary` defines what a term *means* (what a `research` ticket **is**), while this capability states what the procedure resolving it **does**. The boundary that results is clean in three parts — `glossary` holds the vocabulary, `ticket-resolution` holds the resolving procedures and their artifact homes, and unit 6's future capability holds map mechanics, the frontier scan, and claiming. Naming the durable behaviour rather than the skill also follows the precedent `dialogue` set in unit 4.

### Decision: Reference files move into `references/`

- Choice: `LOGIC.md`, `UI.md`, `CONTEXT-FORMAT.md` and `ADR-FORMAT.md` are ported into a `references/` subdirectory rather than left flat beside `SKILL.md`, and each `SKILL.md`'s pointer to them is updated to match.
- Alternatives considered: keeping upstream's flat layout, so the fork is diffable in directory structure as well as in text.
- Rationale: `references/` is not a preference in this repository, it is a committed convention — every one of the six Hamilton skills that carries reference material uses it, and `licensing` states outright that `references/` "means material the agent is expected to read on invocation", which is exactly what these four files are. Three directories breaking that convention would make the fork legible against upstream at the cost of making it illegible against its own neighbours, and a reader of this repository is the more likely reader. This reads "re-homed paths" in the adaptation surface as covering the skill's own layout, not only its output destinations. The cost is that the adaptation commit for two of the three skills touches a pointer line in body prose rather than only a destination, which is a slightly wider diff than a pure destination swap.

### Decision: The prefix does grouping only

- Choice: `hamilton-wayfinder-*` marks these as wayfinder's internals. No router skill is introduced.
- Alternatives considered: a router skill naming the three, per the standard cure for accumulated cognitive load.
- Rationale: the router lever cures *cognitive* load — the burden on a person who must remember which user-invoked skills exist. With model-invocation chosen, the agent reaches these by description and unit 6 reaches them by name, so there is no cognitive load to cure and a router would be a layer with one caller. Unit 6's `hamilton-wayfinder` will dispatch to them anyway, which is the real router, arriving when it is actually needed.

## Architecture & Components

Three sibling directories under `skills/`, mutually independent:

```
skills/
  hamilton-wayfinder-research/
    SKILL.md
    NOTICE
  hamilton-wayfinder-prototype/
    SKILL.md
    NOTICE
    references/LOGIC.md, references/UI.md
  hamilton-wayfinder-domain-modeling/
    SKILL.md
    NOTICE
    references/CONTEXT-FORMAT.md, references/ADR-FORMAT.md
```

No file is shared between them, and none is shared with `skills/hamilton-grilling/`. That is deliberate and follows the reasoning `licensing` already committed: **the unit of distribution decides where a thing lives.** A skill directory is installed on its own and arrives detached from the repository, so anything it needs at read time must sit inside it. A shared `wayfinder-conventions.md` holding the `.hamilton/maps/<effort>/` path once would be the DRY-correct structure in a repository that shipped as a whole, and is the wrong structure here because it would not travel.

The consequence is that the map path convention is written in three directories with no single authoritative copy. This is an accepted duplication, recorded below.

Within a directory, `SKILL.md` carries the steps and routes to its reference material by upstream's own pointers, redirected into `references/`. `hamilton-wayfinder-research` has no reference files at all — it is twelve lines of `SKILL.md` — so it gets no `references/` directory.

### Quality Lens

**Responsibility.** Each directory has one reason to change — the upstream skill it forks changing, or its artifact home moving. The two are the only forces on it, and they are independent of the other two directories. No directory can be described only with an "and".

**Boundaries & dependencies.** The three are mutually independent; none reads another's files. Each depends on Hamilton only through a path convention stated in its own text, which is the narrowest coupling available given that a skill directory travels alone. The dependency runs one way: unit 6's `hamilton-wayfinder` will depend on these three by name, and none of them will know it exists.

**Right-sizing — what was deliberately not added.** No shared conventions file and no fourth "wayfinder internals" skill to hold common material: both would be a layer with three callers that cannot actually reach it once installed. No `type`→skill dispatch table, which is unit 6's job and would be an extension point with no caller if built here. No narrowing of upstream's descriptions, which would be a maintenance surface added to suppress a symptom the prefix already labels.

**Accepted smells.** Three, all taken on purpose and all cross-listed under Risks:

1. *The map path convention is duplicated across three directories with no single source of truth.* Changing where an effort's map lives would mean editing three files that nothing links. Accepted because the alternative — a shared file — does not survive the unit of distribution, which is the same trade `licensing` already made and documented for `NOTICE` text.
2. *Three full-length upstream descriptions sit in the context window every turn, carrying trigger phrasing broad enough to fire outside wayfinder.* Accepted because the verbatim rule governs the description and because narrowing it would make the fork undiffable in the field least likely to be re-checked.
3. *The `ticket-resolution` capability carries one requirement that is not about resolving a ticket.* "Verbatim fidelity to upstream" constrains how the procedures were authored rather than what they guarantee when they run, so the capability has a second, weaker reason to change: upstream's porting discipline, not Hamilton's behaviour. Accepted because the alternative is a `porting-discipline` capability holding exactly one requirement — the per-aspect shard the propose step warns against — and because the fidelity rule is a durable property of these artifacts that a future editor must be able to find. It sits with the artifacts it governs.

## Data & Flow

Nothing executes. The flow this design fixes is where each procedure's output comes to rest:

| procedure | artifact | home |
|---|---|---|
| research | cited findings, one Markdown file | `.hamilton/maps/<effort>/research/` |
| prototype | throwaway code | its own branch, pointed to from the ticket body |
| prototype | the design verdict | the resolving ticket's `## Answer` |
| domain-modeling | crystallized terms | `.hamilton/maps/<effort>/glossary.md` |
| domain-modeling | a decision clearing the three-part bar | the resolving ticket's `## Answer` |

Nothing is written outside `.hamilton/maps/<effort>/` and the ticket files within it. No root `CONTEXT.md`, no `docs/adr/`, no issue tracker.

## Error Handling & Edge Cases

- **Upstream has drifted since ticket 07 read it.** The port is made against upstream *as fetched during this change*, not against the excerpts quoted in ticket 07. If a fetched file differs from what ticket 07 described in a way that changes an adaptation, that is surfaced rather than silently reconciled — the ticket recorded a decision about the fork, not a snapshot of upstream.
- **A fetch returns a paraphrase rather than the source.** Summarising fetchers cannot be used for this change at all: a paraphrase is indistinguishable from a faithful copy at read time and destroys the invariant invisibly. Raw source must be retrieved verbatim, and the first commit of each pair is what proves it was.
- **A directory lands without its `NOTICE`.** `licensing` requires every forked directory to ship a sibling notice, and a directory that exists without one violates that invariant even transiently. The notice therefore lands in the *first* commit of each pair, alongside the verbatim files — it is not part of the adaptation.
- **The intermediate commit is incoherent inside Hamilton.** After the first commit of a pair, `research` still says to save findings "where the repo already keeps such notes". Nothing invokes these skills until unit 6, so no consumer observes the gap; it closes in the next commit.
- **`.hamilton/maps/hamilton-wayfinder/glossary.md` does not exist.** Unit 1's route entry records that this working file was never created — the terms were sharpened inside ticket Answers instead — and frames that explicitly as a fact about how the map was worked rather than a gap to backfill. The port therefore names the path ticket 07 fixed and does not create the file, which is consistent with the proposal's non-goal of writing any glossary content.

## Testing Strategy

There are no automated tests, and none are added. Route unit 7 already records the reason: `skills/` is not bundled and no test asserts on skill content. Inventing a test here would mean inventing a bundling story the repo does not have.

Verification is therefore structural and rests on the commit split:

- **Verbatim fidelity** — for each skill, `git show` on the second commit of its pair lists every departure from upstream. The acceptance check is that this diff touches only frontmatter, the provenance line, an artifact destination, and a `references/` pointer. This is the check the slicing decision exists to enable, and it is why it is worth six tasks.
- **Completeness** — each directory holds a `SKILL.md`, every reference file its `SKILL.md` points at, and a `NOTICE`. A `SKILL.md` pointing at a file that did not ship — or at a path still flat after the move into `references/` — is the failure this catches.
- **Attribution** — each `NOTICE` instantiates the `CONTRIBUTING.md` template with the upstream skill name substituted, and its permission text is byte-identical to the block already in the root `NOTICE`. It is copied from that file rather than retyped.
- **Re-homing** — searching the three directories for `docs/adr`, `CONTEXT.md`, "issue", and "where the repo already keeps" returns nothing at all. Every occurrence of these terms upstream sits in prose that names a destination, and every such passage is re-pointed, so the check carries no exemption: any hit is an unfinished re-homing.

## Constraints & Boundaries

**Always**

- Fetch upstream source as raw text and copy it byte-for-byte. The first commit of each pair must be exactly what was fetched.
- Land each directory's `NOTICE` in the same commit as its files.
- Copy the MIT permission text from the repository's root `NOTICE`, never from memory or a licence template.
- Keep the two commits of a pair separate, in order, verbatim first.

**Ask first**

- Any change to upstream wording that is not a frontmatter field, the provenance line, or a re-homed path.
- Any adaptation the fetched upstream file requires that ticket 07 did not anticipate.
- Adding a file to a skill directory that upstream does not have.

**Never**

- Use a summarising fetcher for source that will be committed.
- Trim, condense, or improve upstream prose. A section made inert by a re-homing is the one case that is *not* an improvement: re-point it to the re-homed destination with the smallest edit that does the job, and neither delete it nor restyle it while you are there.
- Write to `.hamilton/specs/`, the root `NOTICE`, or `CONTRIBUTING.md` in this change.
- Port the `agents/openai.yaml` sidecars — host packaging metadata does not travel with a fork, per unit 4.
- Create `.hamilton/maps/hamilton-wayfinder/glossary.md` or any research or glossary content.

## Risks / Trade-offs

- **Three broad descriptions in context every turn.** Model-invocation with upstream's verbatim trigger phrasing means these can fire on requests unrelated to wayfinder — a knowing relaxation of ticket 07's "not standalone, not discoverable elsewhere". Taken because unit 6 cannot reach a user-invoked skill at all. If misfires prove annoying in practice, the fix is a later effort that revisits the verbatim rule for descriptions specifically, not a quiet narrowing here.
- **The map path convention is duplicated three ways.** Moving where maps live means three unlinked edits. Taken because a shared file does not survive individual installation. The mitigation is that the path is also stated in `.hamilton/specs/glossary.md`, so a reader has one authoritative definition even though the skills each restate it.
- **Six tasks for three small ports.** The commit split roughly doubles the task count against unit 4's shape, and a reader comparing units may find the inconsistency odd. Taken because it converts the change's hardest invariant into something checkable offline. If the convention proves worth keeping, unit 6 should adopt it too rather than leaving unit 5 as the outlier.
- **One requirement sits slightly outside its capability.** `ticket-resolution` holds the verbatim-fidelity rule, which governs how these procedures were authored rather than what they do. Taken because splitting it out would create a single-requirement capability, and because the rule has to be findable by whoever next edits a ported file. Revisit if a second porting effort gives the rule a real domain of its own.
- **The re-homing patches are the widest departure from upstream.** Re-pointing `ADR-FORMAT.md`'s `## Numbering` does not swap a path — there is no second numbering sequence to point at, so the patched sentence states something upstream does not say. The same is true anywhere the re-homing removes a mechanism rather than relocating it. Taken because the alternative ships instructions to create a `docs/adr/` this repository never has, and bounded by two things: the patch is confined to the sentences that name the old destination, and the second commit of each pair exhibits every one of them in a single `git show`. The judgement ticket 07 deferred was *which parts of the toolkit are useful*; nothing here drops a part.

## Migration / Rollout

None. Three new directories; nothing existing changes, and nothing invokes them until unit 6. The only other edit is unit 5's status line in `route.md`.

## Open Questions

None. Ticket 07 fixed the skill set, their names, their coupling and each artifact's home; ticket 03 fixed the attribution form; the two choices unit 5 left open — invocation mode and how the prefix is handled — are decided above.
