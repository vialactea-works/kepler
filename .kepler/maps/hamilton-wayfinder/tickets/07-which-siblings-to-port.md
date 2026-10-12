---
type: grilling
status: resolved
blocked_by: [02]
---

# Which siblings to port, and their Hamilton shape

## Question

Which of `research`, `prototype` and `domain-modeling` come into Hamilton, and what does each look
like once it is a Hamilton skill?

Charting settled that the siblings get ported rather than inlined or soft-depended on. Which ones,
and in what shape, is open — and [Read the three upstream sibling skills](02-read-upstream-siblings.md)
supplies the facts this needs.

Settle, per skill:

- **In or out.** `domain-modeling` is the doubtful one: it writes `CONTEXT.md` and `docs/adr/`,
  which is a parallel durable-truth system next to `.hamilton/specs/` and `AGENTS.md`. Options are
  port it as-is and accept two systems, re-home it onto Hamilton's artifacts, or rule it out of
  scope and have wayfinder's decision tickets lean on `/grilling` alone.
- **Naming.** `hamilton-research` and `hamilton-prototype` follow the `hamilton-*` convention, but
  every existing `hamilton-*` skill is a step in the SDD pipeline. Do these read as pipeline steps
  when they are not? Is there a better prefix or a `references/` home inside `hamilton-wayfinder`?
- **Scope of each port.** Verbatim fork, or trimmed to what wayfinder's ticket types actually
  invoke? `prototype` in particular may carry UI/codegen behaviour beyond what a ticket needs.
- **Standalone or coupled.** Are these usable outside wayfinder — a general Hamilton research skill —
  or strictly wayfinder's internals?
- Whether `grilling` also needs porting, or whether Hamilton relies on the user having it. Note that
  `hamilton-propose` and `hamilton-critique` already encode one-question-at-a-time dialogue, so
  there may be an existing Hamilton answer here.

- **Where each ported skill's output lands.** Inherited from
  [Map artifact layout under .hamilton/](01-map-artifact-layout.md), which fixed a map directory at
  `map.md` + `tickets/` + `route.md` and deliberately gave assets no dedicated home. Upstream
  `research` says to save findings "where the repo already keeps such notes" and names no fallback;
  `prototype` hangs a context pointer on an issue Hamilton does not have. Each port has to answer
  this for itself.

The answer sets how many units the route gains, so it materially sizes the whole effort.

## Answer

**All three siblings port into Hamilton under the `hamilton-wayfinder-*` prefix, strictly internal to wayfinder. Grilling ports separately as `hamilton-grilling`, a general-purpose dialogue primitive that propose and critique will use. Full ports, not trimmed. Artifacts follow Hamilton conventions: research findings to `.hamilton/maps/hamilton-wayfinder/research/`, prototypes linked from ticket bodies, domain-modeling glossary to `.hamilton/maps/hamilton-wayfinder/glossary.md` with hard decisions captured in ticket Answer sections.**

### The three siblings

**`hamilton-wayfinder-research`** — AFK, spins up a background agent for factual investigation. Findings go to `.hamilton/maps/hamilton-wayfinder/research/` (per-research subdirectories). No collisions with Hamilton's model; fits naturally.

**`hamilton-wayfinder-prototype`** — HITL, builds throwaway code to answer design questions. Two branches: LOGIC.md for state models, UI.md for interface variants. Prototypes linked from the ticket body (no issue tracker to hang context on). Throwaway branch preserved for reference; verdict captured in ticket Answer.

**`hamilton-wayfinder-domain-modeling`** — HITL, actively sharpens domain model during grilling by catching imprecise language, stress-testing scenarios, and maintaining a living glossary. Runs *within* grilling sessions, not as a separate ticket type. Working glossary lives at `.hamilton/maps/hamilton-wayfinder/glossary.md` during planning, updated as terms crystallize. Hard decisions surfaced during grilling are captured in ticket Answer sections (tickets are decision records already — no parallel ADR system needed). Once the map transitions to `shipping`, the glossary unit (first in route.md) finalizes the working glossary into `.hamilton/specs/glossary.md` for canonical use.

### Grilling and the dialogue refactor

**`hamilton-grilling`** ports as a general-purpose dialogue skill, not wayfinder-specific. One-question-at-a-time dialogue, wait for feedback, build shared understanding — this pattern belongs at the Hamilton level, not inside wayfinder.

`hamilton-propose` and `hamilton-critique` already encode this dialogue internally. Extracting grilling and having both use it eliminates duplication and elevates dialogue to a first-class primitive. This refactor lives in [ticket 12](12-propose-and-critique-use-grilling.md), unblocked (propose and critique are stable).

### Naming and coupling

`hamilton-wayfinder-research`, `hamilton-wayfinder-prototype`, `hamilton-wayfinder-domain-modeling` are internal to wayfinder — not standalone, not discoverable elsewhere. They're implementation details of wayfinder's ticket types. The prefix groups them explicitly under wayfinder's umbrella while keeping `hamilton-` as the family convention.

### Ticket types unchanged

Hamilton's four ticket types remain: `research`, `prototype`, `grilling`, `task`. Domain-modeling is a supporting skill that runs during grilling, not a separate type. Wayfinder's ticket types are the same as upstream; the ported siblings are the *skills* they delegate to.

### Scope and ports

All three ported verbatim from upstream — no trimming. Full UI.md branch in prototype, full CONTEXT-FORMAT and ADR templates in domain-modeling. Trim later if needed; starting with the complete toolkit.

### Knock-on effects

The map gains a **working glossary section** capturing terms as they crystallize during planning. Route.md's first unit is always the glossary finalization unit — a boilerplate task that merges `.hamilton/maps/hamilton-wayfinder/glossary.md` into `.hamilton/specs/glossary.md` and confirms the canonical glossary is ready before other units begin. This keeps glossary refinement atomic and independent of feature work.
