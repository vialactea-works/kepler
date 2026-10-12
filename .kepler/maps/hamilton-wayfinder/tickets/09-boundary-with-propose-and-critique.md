---
type: grilling
status: resolved
blocked_by: [06]
---

# Boundary with hamilton-propose and hamilton-critique

## Question

Where does `hamilton-wayfinder` stop and `hamilton-propose` start, so the project has one front
door rather than two?

The overlap is real. `hamilton-propose` is already described as "the heavyweight front door": it
turns an idea into a well-formed change "through collaborative dialogue... clarifying questions one
at a time, then two or three alternative approaches with trade-offs", and gates on approval. That is
close enough to a wayfinder decision ticket that a user will reasonably ask which one to reach for.

Settle:

- **The trigger that separates them.** Size ("more than one agent session can hold") is upstream's
  answer. Is that Hamilton's, or is it "more than one change"? A crisp, stated rule matters more
  than which one is chosen.
- **What propose receives.** [route.md shape and the SDD join](06-route-shape-and-sdd-join.md) fixes
  the artifact; this ticket fixes the behaviour. Does `hamilton-propose` change to detect and read an
  upstream route unit, or does it stay untouched and the human pastes context in?
- **Whether propose can be skipped.** If wayfinder's decisions already cover the why and the how for
  a unit, running propose's full dialogue may be redundant ceremony. Does a route unit ever go
  straight to `hamilton-plan`, and who decides?
- **`hamilton-critique`.** It gates the propose artifacts. Is there an equivalent gate on a map or a
  route, or is that over-engineering for a planning artifact?
- **The one-sentence answer** to "which do I run?" that goes in `docs/skills.md`.

## Answer

**One change = one session. Wayfinder breaks a complex goal into clear, realizable units; hamilton-propose transforms each route unit into a concrete change spec ready for autonomous implementation. Every unit goes through propose (no straight-to-plan path). Propose gains map-aware behavior: it reads the map folder, finds the next pending unit in route.md, and pulls context from linked decision tickets. No critique equivalent for maps. One-sentence rule: "Use wayfinder to break a complex goal into clear, realizable units. Use hamilton-propose to transform each route unit into a concrete change spec ready for autonomous implementation."**

### The trigger

One change = one session. Session size and change scope are equivalent — they measure the same boundary. The split is **session-scoped**: if a decision and all its dependencies fit in one agent session, it's a wayfinder ticket or map; if not, it requires multiple charting sessions and the result is a cleared map with a route.

Wayfinder shapes *what we're building* (the decision). Propose negotiates *how we'll build one thing* (the spec for that change). One change always equals one propose session.

### What propose receives

The human points `hamilton-propose` to a map folder, asking it to work on the next unit. Propose reads the folder, finds `route.md`, identifies the next unit with status `pending`, and navigates the decision links to pull full context from the map's tickets.

This is a behavior change for propose: it gains map-aware entrypoint logic. Once it knows which unit it's working on, the rest of propose's workflow (collaborative spec negotiation) stays the same.

### Propose is not optional

Every route unit goes through `hamilton-propose`, even when wayfinder's decisions clearly settle the why and how. Propose provides code-quality review — it validates the implementation approach before code starts. It's a required gate, not optional ceremony.

### No critique equivalent

Critique gates propose's code artifacts. Maps are already human-shaped through grilling — critique's review role doesn't apply to planning artifacts. No equivalent gate on the map or route.

### One-sentence rule for docs/skills.md

"Use wayfinder to break a complex goal into clear, realizable units. Use hamilton-propose to transform each route unit into a concrete change spec ready for autonomous implementation."
