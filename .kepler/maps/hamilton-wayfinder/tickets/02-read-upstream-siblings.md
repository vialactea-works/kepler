---
type: research
status: resolved
blocked_by: []
---

# Read the three upstream sibling skills

## Question

What do the upstream `research`, `prototype` and `domain-modeling` skills actually do, and what
would each cost to bring into Hamilton?

None of the three is installed on this machine; all three exist in
[mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering) under MIT.

For each skill, surface:

- Its full `SKILL.md`, plus any `references/` or `agents/` files.
- What it depends on — other skills it invokes, repo config files it reads (`docs/agents/*.md`,
  `CONTEXT.md`, `docs/adr/`), and any tool it names.
- Whether it is HITL or AFK, and what artifacts it writes.
- The specific collisions with Hamilton's model. `domain-modeling` is the known one: it writes
  `CONTEXT.md` and `docs/adr/`, whereas Hamilton keeps durable truth in `.hamilton/specs/` and
  standing rules in `AGENTS.md` — so a port either introduces a parallel doc system or has to be
  re-homed onto Hamilton's artifacts.
- Its size, so the porting effort can be judged.

This is a facts-only ticket. It decides nothing; it feeds
[Which siblings to port, and their Hamilton shape](07-which-siblings-to-port.md).

Findings go under `## Answer` below, with enough detail that ticket 07 can be resolved without
re-fetching.

## Answer

### research

**What it does:** Spins up a background agent to investigate a question against primary sources — official docs, source code, specs, first-party APIs — not secondary write-ups. The agent follows every claim back to its authoritative source, writes findings to a single Markdown file, and saves it where the repo keeps such notes or "somewhere sensible" by convention. Fits wayfinder's research ticket type. SKILL.md alone (12 lines).

**Dependencies:** None explicit. Expects a repo location to save findings (inferred from existing convention, no specific directory named). No repo files read or config files consulted. agents/openai.yaml declares only display_name and short_description.

**HITL or AFK:** AFK (background agent). Produces artifact: a single Markdown file with findings, location TBD by convention.

**Collisions with Hamilton:** None identified. Fits naturally into Hamilton as an AFK research ticket (wayfinder type). No dependency on AGENTS.md, no spec/glossary involvement, no artifact-location conflict.

**Size:** 12 lines (SKILL.md only); minimal surface area, portable skeleton.

### prototype

**What it does:** Builds throwaway code to answer a design question — either "Does this logic / state model feel right?" (LOGIC.md branch) or "What should this look like?" (UI.md branch). The skill routes to the right branch, then hands off to the branch-specific guide. LOGIC.md describes a tiny interactive terminal app that drives a state model by hand (pure reducer/machine isolated from a thin TUI shell); UI.md describes 3–5 radically different UI variants on a single route or new page, switchable via `?variant=` URL param and a floating switcher. Both branches: throwaway from day one, one command to run, state surfaces on every action, validate the decision, then capture the prototype on a throwaway branch and fold the winner into real code. SKILL.md (26 lines) + LOGIC.md (79 lines) + UI.md (112 lines).

**Dependencies:** None explicit. References "the issue" for context pointer but does not name a specific tracker or location. References "the route" and "the page" (project-specific), and "existing data fetching" (sub-shape A assumes real page). agents/openai.yaml declares only display_name and short_description.

**HITL or AFK:** HITL (human drives the prototype, reacts to it, gives feedback). Produces artifacts: (1) prototype code co-located with real module/page, named so it's obviously throwaway; (2) context pointer from the issue to the throwaway branch; (3) the full prototype (all variants + switcher) committed to throwaway branch after verdict.

**Collisions with Hamilton:** One, and it is the tracker assumption. The skill assumes an issue exists to hang a context pointer on. Hamilton has no issue tracker at all — its artifacts are files under `.hamilton/` (`specs/` durable, `changes/<YYYY-MM-DD-title>/` ephemeral), and this fork's standing decision is file-native with no tracker indirection. So the context pointer needs a file-based home rather than an issue comment. Otherwise it fits wayfinder's prototype ticket type; Hamilton's change-directory model could absorb the prototype, though the skill makes no mention of Hamilton artifacts.

**Size:** SKILL.md 26 + LOGIC.md 79 + UI.md 112 = 217 lines total; two conceptually separate branches, each self-contained.

### domain-modeling

**What it does:** Actively build and sharpen a project's domain model during design by challenging terms, inventing edge-case scenarios, writing the glossary and decisions down as they crystallise. Maintains two classes of durable artifacts: (1) **CONTEXT.md** — a glossary at repo root (or per-context if multiple via CONTEXT-MAP.md) listing canonical terms with definitions and avoided synonyms, updated inline as terms resolve; (2) **docs/adr/** — architecture decision records in `docs/adr/NNNN-slug.md` form, one per hard-to-reverse, surprising, trade-off decision (optional, created lazily). During session: challenge glossary terms against code, sharpen vague language, stress-test domain relationships with concrete scenarios, cross-reference claims against code, update CONTEXT.md inline, and offer ADRs sparingly (only when all three criteria apply: hard to reverse, surprising without context, result of trade-off). CONTEXT-FORMAT.md defines structure and rules (be opinionated, keep tight definitions, group by natural clusters, exclude general programming concepts). ADR-FORMAT.md defines minimal template (short title + 1–3 sentence context/decision/why, optional sections for status/options/consequences). SKILL.md (74 lines) + CONTEXT-FORMAT.md (60 lines) + ADR-FORMAT.md (47 lines).

**Dependencies:** Reads (or creates) CONTEXT.md at repo root; reads code to challenge claims; creates/writes to docs/adr/ directory. Assumes either single context (root CONTEXT.md) or multi-context (root CONTEXT-MAP.md pointing to context-specific CONTEXT.md). agents/openai.yaml declares only display_name and short_description.

**HITL or AFK:** HITL (collaborative glossary/decision work with user, one term/decision at a time). Produces artifacts: (1) CONTEXT.md at repo root (or per-context), formatted per CONTEXT-FORMAT.md; (2) ADRs in docs/adr/, numbered sequentially, formatted per ADR-FORMAT.md; both updated in real-time as decisions crystallise.

**Collisions with Hamilton:** **Direct and significant.** Domain-modeling creates a parallel durable-truth system (CONTEXT.md + docs/adr/) next to Hamilton's `.hamilton/specs/` (canonical specs) and AGENTS.md (standing rules). Specific conflicts:

1. **CONTEXT.md**: Domain-modeling writes a flat glossary at repo root; Hamilton has no glossary artifact, but the canonical spec model (`.hamilton/specs/<capability>.md`) is designed as SRS-style documentation covering Contract, Behavior, Invariants, Decisions. A glossary could live as a `.hamilton/specs/glossary.md` (or per-context equivalent) using the same location/ownership model.
2. **docs/adr/**: Domain-modeling writes numbered ADR records to `docs/adr/`; Hamilton's design phase produces `design.md` (SDD) but has no explicit ADR location. The finish step folds requirement deltas into specs (the Decisions section). ADRs could move into `.hamilton/specs/` as a Decisions section or live as `.hamilton/adr/` (parallel to specs).
3. **Timing**: Domain-modeling is invoked during active design (sharpening terms, recording decisions as they happen); Hamilton's propose step also involves design, but the timing and artifact ownership (change-specific vs. living spec) is different.

Re-homing onto Hamilton would require: (1) Redefine CONTEXT.md writes to target `.hamilton/specs/glossary.md` or equivalent, using Hamilton's location/ownership semantics; (2) Redefine ADR writes to target `.hamilton/adr/` or as part of the Decisions section in `specs/`; (3) Clarify timing: is domain-modeling applied per-change (producing change-specific glossary deltas?) or to the living specs directly?

**Size:** SKILL.md 74 + CONTEXT-FORMAT.md 60 + ADR-FORMAT.md 47 = 181 lines total; core logic (glossary/ADR management, term challenging) is portable; artifact locations and ownership semantics require re-homing.

### Open gaps

1. **research**: Where exactly to save findings? The skill says "save where the repo already keeps such notes" but does not define a fallback (no `docs/research/` or `.hamilton/research/` convention named). Wayfinder tickets resolve this by linking from the issue, but the standalone skill is silent.
2. **prototype**: Issue tracker assumption. The skill mentions leaving a context pointer to the throwaway branch on the implementation issue, but does not name the tracker (GitHub, Linear, local markdown) or say how it would detect one. Upstream wayfinder assumes a tracker exists; Hamilton does not have one, so this pointer needs re-homing. Where it lands is a decision for ticket 07, not a fact this ticket can supply.
3. **prototype & domain-modeling agents/openai.yaml files**: Both are minimal (display_name + short_description only). They do NOT declare `allow_implicit_invocation: false` like wayfinder's. Unverified whether these skills are designed for implicit invocation or user-triggered only; wayfinder's stricter HITL model (agent never answers its own questions) may conflict with implicit invocation if these skills support it.
4. **domain-modeling**: The skill does not explicitly forbid re-homing CONTEXT.md / docs/adr/ to Hamilton's `.hamilton/` locations, but it also makes no mention of Hamilton artifacts. Verification needed: whether the skill's glossary/ADR logic is general enough to work against `.hamilton/specs/glossary.md` and `.hamilton/adr/` without rewrite, or whether its assumptions about repo structure are baked in.
5. **All three**: upstream `wayfinder/SKILL.md` invokes research / prototype / domain-modeling from its ticket-type definitions, but says only that "assets created while resolving a ticket are linked from the issue, not pasted in". It does not specify where those assets live. Since Hamilton has no issue to link from, each ported skill's output needs a file-based home — the research findings file, the prototype's throwaway branch pointer, and domain-modeling's glossary/ADRs. Feeds ticket 07, and overlaps
   [Map artifact layout under .hamilton/](01-map-artifact-layout.md).
