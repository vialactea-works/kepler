# Code quality reference

This self-review rubric applies at **design and planning altitude**, where decisions shape code quality. A design's structure and a plan's task boundaries and sketches constrain later implementation. Binding design and standards remain authoritative; dependency-mode v2 workers use bounded judgment to meet Goal and Acceptance rather than merely transcribing snippets, while historical serial tasks retain their verbatim Steps contract. Fix structural defects here instead of paying to refactor code after review.

## How to use this

- During self-review, check each principle against the artifact (`design.md`, or a `plan.md` task and its snippets) for an observable **smell**, not a vague impression. If you find one, apply the **fix** before clearing the gate.
- **Scale scrutiny to the change.** A mechanical or one-file change triggers few of these principles; a new subsystem triggers many. Do not gold-plate a small change to satisfy a checklist. When in doubt, focus on decomposition and boundaries, where mistakes cost more.
- **The vocabulary is paradigm-neutral.** "A unit" means a module, class, or function, as the target codebase uses it. SOLID translates across paradigms: read "depends on an abstraction" as an interface, a passed function, or an injected effect, as the code demands.

## Principles

Each entry states a principle, followed by a design or plan **smell** and its **fix** on separate lines.

### Domain ownership & architectural attribution
The glossary and authoritative sources establish the model; each affected package, its ports and adapters, and significant code must have an explicit responsibility owner.
- **Smell:** goals use unsourced meanings; a directory is treated as a context; a domain rule sits in an adapter without justification; affected responsibilities, contract owners or removal transfers are missing.
- **Fix:** cite context-scoped sources and map responsibility to the owning domain/context or infrastructure role. Describe provided/required contracts and their translation; preserve callers' success and failure outcomes across transfers unless explicitly changed. Distinguish proposed references from existing code and verify existing claims against source. Record material unknowns for requester resolution. Use concise prose when sufficient; do not invent a context, event, layer or interface to fill a table. This criterion checks relevant semantic coverage, not historical artifact layout.

### Single responsibility (cohesion)
A unit has one reason to change.
- **Smell:** you cannot state a component's responsibility without "and" or a bulleted list; one plan task bundles unrelated changes.
- **Fix:** split along independent axes of change — one component and one task per reason to change.

### Low coupling / clear boundaries
Units depend on as little of each other as possible, through narrow interfaces.
- **Smell:** a component reaches into another's internals; a boundary passes a concrete, mutable data structure through; a described change ripples across many modules.
- **Fix:** define a narrow interface that hides internals so they can change without breaking consumers.

### Dependency inversion & testable seams
High-level policy depends on abstractions, not concrete details, and every unit has a seam where a test can substitute its collaborators.
- **Smell:** core logic names a concrete IO/DB/clock/network/randomness source directly; a plan task describes behavior that can only be exercised with real IO.
- **Fix:** inject the dependency behind an interface or parameter, and name the seam in the design so the plan can test against it.

### Open for extension
Adding a case does not mean editing the branching of the existing one.
- **Smell:** a design that grows a new `switch`/`if`-arm per type; "to add X you edit function Y."
- **Fix:** use polymorphism, a lookup table, or a registry so new cases are additive.

### Substitutability
Every variant honors the contract its callers rely on; no caller needs to know which variant it holds.
- **Smell:** an implementation that throws on or silently no-ops part of the interface; callers that type-check the concrete variant before acting.
- **Fix:** rethink the hierarchy or narrow the interface to what all variants share.

### Interface segregation
A client depends only on what it uses.
- **Smell:** a fat interface whose implementers stub half its methods; a component pulled into depending on a large module for one function.
- **Fix:** split into role-specific interfaces sized to each client.

### DRY / single source of truth
Each piece of knowledge — a rule, a constant, a shape — has one authoritative definition.
- **Smell:** the same logic or value appears in two design components or two plan tasks; parallel structures that must be changed together to stay correct.
- **Fix:** name it once and reference it.
- **Counter:** do not merge things that are only incidentally alike today; that couples them for no reason.

### Right-sized abstraction (YAGNI)
Structure matches real, present need — and no more.
- **Smell:** a layer, generic, config knob, or extension point with exactly one caller and no requirement asking for a second.
- **Fix:** cut it; add the seam when the second case arrives. This counters the principles above: apply them to solve concrete problems, not to speculate.

### Intention-revealing names
Names state purpose, and units where relevant.
- **Smell:** `data`, `manager`, `helper`, `process()`, boolean flags whose meaning you must trace the code to recover.
- **Fix:** name the domain concept the reader needs.

### Explicit error and edge handling
Failure modes are designed, not incidental.
- **Smell:** a design with only a happy path; a plan task whose acceptance criteria never mention an error or edge case; errors that get swallowed or flattened into strings.
- **Fix:** list each failure → expected behavior and make each a testable acceptance criterion.

### Complexity budget
Prefer the simplest structure that solves the actual problem; watch size, nesting, and indirection.
- **Smell:** a planned function that will plainly outgrow a screen or nest past a few levels; a design carrying more layers of indirection than the problem has moving parts.
- **Fix:** decompose, flatten with early returns, or remove the indirection.

## The two artifacts this judges

- **`design.md`** — decomposition, boundaries, and dependencies: the structure the code inherits. This is the highest-leverage place to apply the rubric.
- **`plan.md`** — whether tasks preserve that structure and keep each unit independently testable, and whether any code snippet models the clean shape rather than a shortcut the coder will copy.

## Dependency-mode boundaries

Keep approval ownership outside execution. A scope reservation cannot introduce a new dependency, public contract or security-policy change; require owner-approved re-planning instead.
