# Capability: ticket-resolution

## Overview

The procedures a wayfinder decision ticket is resolved by — what each one investigates or builds, and where the artifact it produces comes to rest. A ticket's type is a promise about how it gets answered: a `research` ticket delegates to a background investigation, a `prototype` ticket to throwaway code built to answer one design question, a `grilling` ticket to live dialogue that sharpens the effort's vocabulary as it goes. This capability is what makes each of those promises keepable. It owns the resolving procedures and the homes of what they write; it does not own the vocabulary those tickets are phrased in — that is `glossary` — nor how a map is charted, how the frontier is scanned, or how a ticket is claimed. Every artifact it produces comes to rest inside the map the ticket belongs to, which is what lets a finding or a working definition outlive the change that produced it without competing with the canonical specs.

## Contract

Each procedure resolves one ticket and leaves exactly one durable trace. Where that trace lands is the capability's interface to everything downstream:

| procedure | artifact | home |
|---|---|---|
| research | cited findings, one Markdown file per investigation | `.hamilton/maps/<effort>/research/` |
| prototype | throwaway code | the `prototype/<map-name>/<ticket-name>` branch (`prototype/<question-slug>` when invoked outside a map ticket), pointed to from the resolving ticket's body |
| prototype | the design verdict | the resolving ticket's `## Answer` |
| domain-model sharpening | the effort's crystallized terms | `.hamilton/maps/<effort>/glossary.md` |
| domain-model sharpening | a decision clearing the three-part bar | the resolving ticket's `## Answer` |

`<effort>` is the map being worked. Nothing lands outside that map directory and the ticket files within it.

Each procedure is reachable by name, both by a person invoking it directly and by another skill invoking it — the skill that works a map dispatches on a ticket's type, so a procedure hidden from another skill's reach is a promise that cannot be kept. Both paths run the same procedure; there is no second mode.

## Behavior

**Research.** A `research` ticket is resolved by delegating its investigation to a background agent, so the session that raised the question keeps working while the reading happens — this is the one ticket type that runs away from the keyboard, and the delegation is what makes it so. The investigation works from primary sources: a claim met in a secondary write-up is followed back to the official documentation, source code, specification, or first-party API that owns it, and that is the source cited. Findings are recorded as a single Markdown file in which every claim names where it came from, which is what makes a finding load-bearing enough for a decision to rest on. Successive investigations on one map stay separable rather than merging into a single accumulating file.

**Prototype.** A `prototype` ticket is resolved by building throwaway code that answers one design question. The question's shape decides the artifact: whether a logic or state model feels right calls for something materially different from what an interface should look like, so the routing happens first rather than being settled by habit. A question that does not clearly indicate its branch is disambiguated before any code is written. Before any prototype artifact is written, the work is gated on its own git branch: `prototype/<map-name>/<ticket-name>` — the map's effort slug and the ticket file's `NN-slug` — created from the current branch, or resumed when it already exists; invoked outside a map ticket, the branch is `prototype/<question-slug>` derived from the design question. Prototype code exists only on that branch, so the branch a session starts on stays clean and the branch's existence is observable evidence the procedure ran. The code is marked throwaway from the outset and is not carried into production as-is; it earns its cost by answering the question, and the answer is the thing that survives. When the human reaches a verdict, outstanding work is committed on the prototype branch and the session returns to its starting branch, folding any validated decision into the real artifact there; the verdict is written into the resolving ticket's `## Answer` and the ticket body carries a pointer to the prototype branch, which remains reachable there rather than being deleted.

**Domain-model sharpening.** Vocabulary is sharpened while a decision is being made, not audited afterwards — drift is cheapest to catch in the moment and most expensive to unpick later. The procedure runs inside an existing `grilling` ticket: it challenges language used loosely, resolves two words for one thing into a single agreed term, and tests a proposed definition against a concrete scenario and against how the code already uses the word. Terms are written to the map's working glossary as the session runs rather than reconstructed at the end. It adds no ticket type of its own; the four types are unchanged.

**Decision capture.** A hard decision surfaced during sharpening is recorded in the resolving ticket's `## Answer`. Recording is offered only when the decision is hard to reverse, surprising without context, *and* the result of a real trade-off — all three, so the section does not fill with decisions that needed no recording. A wayfinder ticket already is a decision record, a question with its answer appended, so nothing separately numbered is created for it.

**Examples**

- a `research` ticket is picked up -> the investigation runs in a background agent rather than in the picking session
- the investigation meets a claim in a secondary write-up -> the claim is followed back to the source that owns it, and that source is cited
- an investigation completes -> its findings exist as one Markdown file under the map's `research/`, every claim naming its source
- a second research ticket on the same map is resolved -> its findings stay separable from the first investigation's
- a prototype ticket asks whether a logic or state model feels right -> the logic branch is taken
- a prototype ticket asks what something should look like -> the UI branch is taken
- the question does not clearly indicate a branch -> the ambiguity is resolved before building, not by picking one and starting
- a prototype resolution begins on map `payments-redesign`, ticket `03-storage-model` -> branch `prototype/payments-redesign/03-storage-model` is created from the current branch before any code
- the prototype procedure is invoked outside a map ticket -> the branch is `prototype/<question-slug>`
- the prototype branch already exists -> it is resumed, not treated as an error
- a prototype resolution completes -> the branch the session started on holds no prototype code
- prototype code is written -> it is marked throwaway from the outset
- the human reaches a verdict -> the verdict lands in the ticket's `## Answer`, and the ticket body points at the branch holding the prototype
- the verdict is recorded -> the prototype remains reachable on its branch, and no issue tracker is consulted at any point
- a term is used loosely, or two terms are used for one thing -> the imprecision is surfaced and resolved into one agreed term
- a proposed definition is under discussion -> it is checked against a concrete scenario and against how the code already uses the term
- a term's definition is agreed during a session -> it is written to the map's `glossary.md` as the session runs
- sharpening runs -> it runs within an existing `grilling` ticket, and the four ticket types are unchanged
- a decision is hard to reverse, surprising without context, and the result of a real trade-off -> recording it is offered, and it lands in the resolving ticket's `## Answer`
- a decision satisfies only some of the three criteria -> no decision record is offered for it
- a skill that works a map invokes a procedure by name -> the invocation resolves and the procedure runs
- a person invokes a procedure by name -> it runs the same procedure; there is no second mode

## Invariants

- Every artifact a procedure produces MUST resolve to a path under `.hamilton/maps/<effort>/` or to a section of a ticket file within it. A procedure MUST NEVER leave an artifact's home to whatever convention the surrounding repository happens to have.
- No procedure creates a `CONTEXT.md` at the repository root, a `docs/adr/` directory, or any separately numbered decision-record file, and NEVER consults an issue tracker.
- No procedure writes to `.hamilton/specs/`. The canonical specs are reached only by the pipeline's finish-work step; the map's glossary is the working artifact, and `.hamilton/specs/glossary.md` is the single canonical destination reached only when the map's terms are harvested.
- Recording a decision is offered only when it is hard to reverse, surprising without context, and the result of a real trade-off. Satisfying some of the three is NEVER enough.
- Domain-model sharpening MUST run within an existing `grilling` ticket and MUST NEVER become a ticket type of its own.
- Each procedure MUST remain reachable by another skill invoking it by name, and MUST NEVER be configured in a way that removes it from that reach — a ticket type is a promise that its resolving procedure will be invoked.
- Prototype code MUST exist only on the resolution's `prototype/...` branch, created from the current branch before any prototype artifact is written. The branch a session starts on MUST NEVER end a prototype resolution holding prototype code.

## Decisions

- **The map is where a resolving artifact comes to rest.** A research finding and a working glossary both outlive the change that produced them and both span several of them, which is exactly what the map already is. Routing them to the canonical specs instead would bypass the pipeline that syncs those specs deliberately at finish-work; leaving the destination to "wherever the repository keeps such notes" leaves the artifact homeless. When a new procedure needs a home, the map is the default and the specs are not.
- **A ticket absorbs both halves of a resolution — the pointer and the answer.** Because a wayfinder ticket already is a decision record, the artifact pointer goes in its body and the verdict in its `## Answer`, rather than into a tracker comment or a separately numbered file. A second copy of the same thing under a different name is what a parallel record system amounts to.
- **The branch gate front-loads the throwaway discipline.** Prototype code is born on a branch named for the map and ticket rather than moved to a throwaway branch at capture: the working branch stays clean even when a closing step is skipped, the branch name gives the ticket a stable pointer, and the branch's existence is observable evidence the procedure ran. An existing branch is resumed rather than suffixed because the branch is the ticket's identity, and a HITL prototype often spans interruptions.
- **The upstream fork is complete; procedure text now evolves freely.** A byte-fidelity rule with a narrow adaptation surface governed the initial port of the upstream skills so the fork stayed diffable in both directions. With the fork established, that diffability no longer pays for the improvements it blocks — starting with the branch gate — so the rule is retired and the procedures are edited like any other skill text.
- **The capability is named for the durable behavior, not for the skills that carry it.** One capability holds all the resolving procedures and their artifact homes; per-procedure capabilities would be shards of one domain, and folding them into `glossary` would confuse what a ticket type *means* with what the procedure resolving it *does*.
