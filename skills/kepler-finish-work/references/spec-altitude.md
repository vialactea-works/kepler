# Spec altitude reference

A rubric for the **altitude** and **shape** of a canonical spec
(`.kepler/specs/<capability>.md`) — the level of abstraction at which it states what a
capability guarantees, and the human-readable form it takes. It governs two producers of
canonical specs:

- **distillation** — `kepler-finish-work` folding a change's structured requirement deltas
  into the canonical spec.
- **direct authoring** — `kepler-compose-spec` reformatting an existing spec, or writing one
  from the application code.

It does **not** govern the change artifacts themselves.

**Change artifacts may be as specific as they need to be.** A `requirements/` delta, a
`design.md`, a `plan.md` — these describe one particular change and can name concrete mechanism,
exact signatures, and even code when that is the clearest way to pin the work down. Requirement
deltas keep the structured `SHALL` + `WHEN`/`THEN` form; design explains the model and architecture,
and plan records implementation steps. Do not apply canonical-spec altitude restrictions to them.

**The canonical spec is different.** It is the project's durable body of knowledge — the
contracts, behaviors, invariants, decisions, and learnings that outlive any single change. It is
read by everyone who touches the capability next, so it is written **at altitude** and it **reads
like documentation a human wrote**, not like a compliance form. A canonical spec pinned to
mechanism becomes false on the next refactor and stops being usable as shared knowledge; a
canonical spec buried in `SHALL`/`WHEN`/`THEN` scaffolding stops being read at all.

## Capability scope

A capability is a cohesive, durable responsibility with a clear boundary and observable contract. It may represent a domain, subdomain or bounded context, including infrastructure responsibilities. Identify its scope, related contexts and ownership in Overview, using the canonical glossary and documented language. An external API model and its translation contract may qualify; a transport, endpoint or implementation file alone does not establish a bounded context. Avoid duplicate parent/child contracts and preserve existing capability slugs and artifact mappings. Do not invent a classification or rewrite historical specs solely to adopt this terminology.

The canonical glossary uses the requirements-spec envelope for lint compatibility, but holds vocabulary rather than application behavior. Its dedicated template keeps the five sections concise and language-focused; do not distill implementation decisions into glossary entries.

## The shape: a light universal skeleton

Every canonical spec uses the five sections required by `kepler workbench lint`: Overview,
Contract, Behavior, Invariants, and Decisions. Keep a required section concise when a capability
has no applicable facts, and omit optional subsections rather than inventing guarantees. The
skeleton guides new writing; lint alone decides whether an existing artifact's format is valid.

```markdown
# Capability: <name>

## Overview
<One paragraph: what this capability is responsible for, in plain prose.>

## Contract
<The concrete interface a consumer touches: field tables, schemas, endpoints,
 request/response shapes, status codes, error taxonomy. This is where a data-model
 spec shows field names and types, and an endpoint spec shows its routes.>

## Behavior
<Narrative input->output prose, including edge and error paths.>

**Examples**
- <input / trigger> -> <observable outcome>
- <input / trigger> -> <observable outcome>

## Invariants
- <A property that holds across all states and over time.>

## Decisions
- <A reusable design rule or deliberate decision future work must follow.>
```

For new writing, prefer flowing prose and tables where they make a contract clearer. These
presentation choices are not extra validity gates for a spec that passes lint.

**Anchors.** The five section headings, plus any domain subheadings you add under Contract or
Behavior (e.g. `### RAP_OPERATION_SYNC`, `### POST /events`), are the **merge anchors**. A change
is folded in by locating the section or subsection its behavior belongs to and updating it — not
by matching a `Requirement:` name. Keep subheadings stable and named for the durable thing they
describe (an event type, an endpoint, a config group), so the next change can find them.

## Register → section mapping

Everything in a canonical spec is one of four registers. If a sentence is none of them, it does
not belong. Each register has a home section:

| Register | Section | Holds |
|----------|---------|-------|
| **Contract** | `## Contract` | the interface to consumers: endpoints, request/response shapes, status codes, persisted schema, field names and types, error taxonomy. |
| **Behavior** | `## Behavior` (+ **Examples**) | observable input → output, including edge and error paths. |
| **Invariant** | `## Invariants` | a property that holds across all states and over time. |
| **Decision / pattern** | `## Decisions` | a *reusable* design rule or deliberate decision, stated so future work follows it. Where the "learnings and decisions" from `design.md` land — distilled to the rule, not the instance. |
| (narrative frame) | `## Overview` | one paragraph orienting the reader to what the capability is. |

## Domain and architecture mapping

Use the canonical glossary and authoritative project sources for meanings, contexts and ownership. Keep the model consistent across artifacts while preserving the distinction between change intent and current capability truth. Map only supported, relevant facts:

| Durable fact | Canonical home |
| --- | --- |
| Domain/context responsibility, related contexts and boundary ownership | Overview |
| Consumer-visible ports, commands, events, payloads and error contracts | Contract |
| Observable interactions, state transitions, guards and translation outcomes | Behavior and Examples |
| Rules that hold across states, including their owning context | Invariants |
| Durable boundary, dependency-direction and translation policies | Decisions |

Private wiring, package inventories and source-code attribution remain in design; they are not canonical requirements. A public package API can be a consumer contract. A reusable ownership or dependency rule may belong in Decisions; a concrete adapter class or injection token is mechanism. The black-box test applies to behavioral guarantees, while architectural policy must survive a reasonable reimplementation even when dependency inspection checks compliance.

Preserve established model facts during reformat; do not force new classifications or invent definitions. From-code documents current behavior, never a proposed design as already implemented. Distillation takes its content only from the approved change inputs, under finish-work's synchronization rules. Surface conflicts and uncertain meanings before publishing dependent claims. Keep all five canonical sections concise and omit irrelevant subsections; no new domain metadata or mandatory architecture catalog is needed.

## The altitude test

Applies to every statement you are about to write into the canonical spec. A statement is at the
right altitude when it would **survive a reasonable reimplementation**: rewrite the feature in
another language, with different names and control flow, keeping the observable behavior — the
statement is still true.

Three litmus checks, sharpest first:

1. **Black-box scenario.** Each behavioral guarantee should be observable through inputs and outputs. A behavior verified only by inspecting source, an AST, or call structure is too low. You cannot black-box-test "uses a `switch`." You can black-box-test "not-found → 404." Durable architectural policies use the decision/pattern test below; dependency inspection alone does not make a reusable policy too low.
2. **The "via / using / as" tell.** A clause like "… via a `BeforeCreate` hook", "… using a
   `switch`", "… as a `json.RawMessage`" almost always names a HOW. Cut the clause; keep the WHAT.
3. **Reason to change.** If the statement would change for a reason no consumer of the contract
   would care about — an internal rename, a control-flow cleanup, a library swap — it is too low.

## The Examples block: scenarios, distilled

The change-side deltas carry `WHEN`/`THEN` scenarios — proto-conformance tests. In the canonical
spec that scaffolding reads robotic, but the *information* is worth keeping. Fold each surviving
scenario into a compact **Examples** bullet under `## Behavior`, as an input → outcome pair:

- `WHEN a required environment variable is not set / THEN the parser errors and the service exits`
  becomes `- unset required var (e.g. APP_QUEUE_URL) -> parser errors, exit at startup`.

Keep only the examples that state durable, black-box behavior; drop those that were really
restating mechanism. The block stays greppable, so a test-writer or reviewer can still enumerate
the capability's conformance points — without a `#### Scenario:` heading in sight.

## Voice

Write the canonical spec as plain technical documentation. Reserve the normative keywords
`MUST` / `NEVER` for the `## Invariants` section and hard boundaries, where the emphasis earns
its keep. Elsewhere, natural declarative prose ("The controller routes by type without re-parsing
the payload") says the same thing and reads better. (The change-side deltas keep `SHALL`
regardless — this voice guidance is for the canonical spec only.)

## The decision/pattern register: policy, not incident

This register most easily drifts low. Record a design detail in `## Decisions` **only** if it is a
reusable rule or a decision that constrains future work in more than one place. Test: *"is this a
policy, or an incident?"*

- **Policy (keep, as a rule):** "HTTP handlers depend on a narrow consumer-defined interface,
  never the concrete store." "DB errors are translated to domain sentinels at the repository
  boundary." These recur; a new call site should obey them. Draw them from `design.md`'s
  Decisions.
- **Incident (drop):** "`handleUpdate` uses a `switch`." "The store wraps `*gorm.DB`." True at
  exactly one call site; constrains nothing else. This is where mechanism leaks in.

When you keep a pattern, state the **rule**, not the **occurrence**: "error-to-status mapping
happens at the HTTP boundary via typed sentinels" — not "`handleUpdate` matches `ErrX` and `ErrY`."

Cross-cutting idioms (naming, DI style, error mapping) belong once in a project guideline and are
referenced, not restated in every capability spec. A capability spec states a pattern only when
that capability is where the pattern is established.

## A canonical spec MUST NOT contain

- Control-flow choices (`switch`/`if`, loop shape, early-return style).
- Names of internal/private structs or constructor/factory signatures, or their field lists —
  *unless the fields are the consumer-facing contract* (a persisted schema, a request/response
  body, an event payload), in which case they belong in `## Contract` as a field table.
- Library mechanics (ORM hooks, specific SDK calls) — state the **effect**, not the call.
- File paths or package layout **as requirements**. (Fine as an informative aside; a requirement
  anchored to a path is false the day the file moves.)
- Behavioral guarantees that can only be verified by reading source. This excludes private mechanism, not durable architectural policies in Decisions.

(All of the above are legitimate in the change's `requirements/`, `design.md`, or `plan.md` —
they just do not survive the distillation into the canonical spec.)

## Before → after

A change's `requirements/` delta legitimately said, in structured form:

> ### Requirement: Remediation job database table
> … The `id` column SHALL be generated as a UUID v4 on insert via a GORM `BeforeCreate` hook.
> The `status` column SHALL be constrained to PENDING/COMPLETED/FAILED …
>
> #### Scenario: New job persisted
> - WHEN a job is created
> - THEN its id is a server-assigned UUID and its status is PENDING

Distilled into the canonical spec — keep the contract and invariant, drop the mechanism, land it
in the skeleton:

> ## Contract
> A remediation job persists with a server-assigned UUID `id`, a `status` of
> PENDING / COMPLETED / FAILED, and its operation payload.
>
> ## Behavior
> A new job is created in PENDING and moves to COMPLETED or FAILED as it resolves.
>
> **Examples**
> - create a job -> id is a server-assigned UUID, status PENDING
>
> ## Invariants
> - `status` MUST be one of PENDING / COMPLETED / FAILED.
> - Adding a field to a job's payload MUST NOT require a schema migration.

The `BeforeCreate` hook, the column types, and the GORM mechanics stay behind in `design.md` and
the code.

And a "requirement" that was really a review nit —

> ### Requirement: Error handling in handleUpdate
> The `handleUpdate` method SHALL use a `switch` statement … to return 404 / 400.

— does not enter the canonical spec at all: the behavior ("unknown id → 404") is already the
endpoint's contract in its `## Contract` / `## Behavior`, and the `switch` is mechanism.
