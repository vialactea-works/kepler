---
type: grilling
status: resolved
blocked_by: [07]
---

# Ticket types in the Hamilton fork

## Question

Which ticket types does `hamilton-wayfinder` keep, and what are they called?

Upstream has four — `research`, `prototype`, `grilling`, `task` — split across HITL (worked with a
human who speaks for themselves) and AFK (agent alone). Each type is defined by the skill it
delegates to, so [Which siblings to port](07-which-siblings-to-port.md) constrains this directly:
a type whose skill was not ported has to be redefined or dropped.

Settle:

- **The set.** Do all four survive? Does `prototype` earn its place in a repo whose destination is
  usually a decision about code?
- **Naming.** "Grilling" names a technique, not a category, and it is the default case. Hamilton's
  vocabulary would more likely call it `decision`. Renaming costs fidelity to upstream and any
  shared muscle memory; keeping it imports a term Hamilton does not otherwise use. Check
  `docs/sdd-framework.md`'s ubiquitous-language posture before deciding.
- **HITL/AFK.** Upstream's rule is strict: a HITL ticket only resolves through live exchange and the
  agent never answers its own questions. Hamilton's `AGENTS.md` boundary model has a third state —
  "Ask first", resolved unattended by the agent deciding and recording its reasoning. Do the two
  reconcile, or does wayfinder keep the stricter rule?
- **Where the type is recorded** — settled mechanically by
  [Map mechanics in files](04-map-mechanics-in-files.md); this ticket only fixes the vocabulary.

## Answer

**All four upstream types survive in Hamilton's wayfinder: `research` (AFK), `prototype` (HITL), `grilling` (HITL), `task` (HITL/AFK). The type name is recorded in YAML frontmatter per ticket 04. Wayfinder keeps upstream's strict HITL rule — no agent-standing-in-for-humans decision-making during planning. Hamilton's three-tier boundary model ("Always / Ask first / Never") applies to autonomous execution in the SDD pipeline, not to wayfinder's planning phase.**

### The set

All four survive. Prototype earns its place despite wayfinder's typical destination being a decision about code — it is invaluable for design questions that hinge on "how does this feel to use" (state machine interaction, UI patterns, interaction flow). Not every wayfinder will need it, but across Hamilton's user base, prototyping is essential for completeness. See ticket 13 (future work outside this map's scope) for prototype skill improvements.

### Naming

`grilling` is the type name. It is precise — it names the specific one-question-at-a-time dialogue technique — and preserves fidelity to upstream. Hamilton's SDD framework (docs/sdd-framework.md) describes the dialogue technique in the propose step ("clarifying questions one at a time, then alternatives with trade-offs, then gating on approval") but does not name it. Wayfinder names it explicitly. Since the technique is distinct and taught, importing the term is better than a generic rename.

### HITL/AFK reconciliation

No tension. They operate at different stages:

- **Wayfinder** (planning phase): Strictly HITL. All ticket types resolve through live human dialogue — research findings are presented for human judgment, prototypes are built to react to, grilling is collaborative, tasks are handed as precise checklists to unblock decisions. The agent never stands in for the human's voice during planning.
- **Hamilton's SDD pipeline** (execution phase): The three-tier model ("Always / Ask first / Never") in AGENTS.md is a guardrail for autonomous code and orchestration steps. An "Ask first" decision can be resolved unattended by the agent if it records its reasoning — appropriate for tactical execution questions. Not appropriate for wayfinder's "What are we building?" decisions.

Wayfinder keeps upstream's stricter rule because planning requires human judgment. The tiers kick in downstream where the agent needs guardrails for autonomy.

### Type recording

All four types use YAML frontmatter (type field) per [Map mechanics in files](04-map-mechanics-in-files.md). No special handling.
