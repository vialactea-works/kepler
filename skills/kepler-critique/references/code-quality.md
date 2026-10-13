# Code quality reference

A self-review rubric for **design and planning altitude** — the point where code
quality is actually decided. The structure a design commits to, and the way a plan slices
and sketches the work, constrain every later implementation. Binding design and standards remain authoritative, while dependency-mode v2 workers use bounded judgment to meet Goal and Acceptance rather than merely transcribing snippets; historical serial tasks retain their verbatim Steps contract. Catching a structural defect at review means paying to refactor code that already exists.
Fix it here instead.

## How to use this

- During self-review, walk each principle and check the artifact (`design.md`, or a
  `plan.md` task and its snippets) for the **smell** — a trigger you can actually observe in
  the text, not a vibe. If it trips, apply the **fix** before clearing the gate.
- **Scale scrutiny to the change.** A mechanical or one-file change trips few of these; a
  new subsystem trips many. Proportionality is itself a quality principle — do not gold-plate
  a small change to satisfy a checklist. When in doubt, spend the scrutiny on decomposition
  and boundaries, which are the expensive things to get wrong.
- **The vocabulary is paradigm-neutral.** "A unit" means a module, class, or function,
  whichever your target codebase uses. SOLID is included because it translates cleanly across
  paradigms — read "depends on an abstraction" as an interface, a passed function, or an
  injected effect, as the code demands.

## Principles

Each entry states the principle in one line, then the **smell** to look for in a design or
plan and the **fix**, on their own lines.

### Domain ownership & architectural attribution
The glossary and authoritative sources establish the model; each affected package, its ports and adapters, and significant code have explicit responsibility ownership.
- **Smell:** goals use unsourced meanings; a directory is treated as a context; a domain rule sits in an adapter without justification; affected responsibilities, contract owners or removal transfers are missing.
- **Fix:** cite context-scoped sources and map responsibility to the owning domain/context or infrastructure role. Describe provided/required contracts and their translation, preserving callers' success and failure outcomes across transfers unless explicitly changed; distinguish proposed references from existing code and verify existing claims against source. Record material unknowns for requester resolution. Use concise prose when sufficient; do not invent a context, event, layer or interface to fill a table. This criterion checks relevant semantic coverage, not historical artifact layout.

### Single responsibility (cohesion)
A unit has one reason to change.
- **Smell:** you cannot state a component's responsibility without "and" or a bulleted list;
  one plan task bundles unrelated changes.
- **Fix:** split along the axes that change independently — one component, one task, per
  reason to change.

### Low coupling / clear boundaries
Units depend on as little of each other as possible, through narrow interfaces.
- **Smell:** a component reaches into another's internals; a boundary passes a concrete,
  mutable data structure through; a described change ripples across many modules.
- **Fix:** define a narrow interface and hide what is behind it, so internals can change
  without breaking consumers.

### Dependency inversion & testable seams
High-level policy depends on abstractions, not concrete details, and every unit has a seam
where a test can substitute its collaborators.
- **Smell:** core logic names a concrete IO/DB/clock/network/randomness source directly; a
  plan task describes behavior that can only be exercised with real IO.
- **Fix:** inject the dependency behind an interface or parameter, and name the seam in the
  design so the plan can test against it.

### Open for extension
Adding a case does not mean editing the branching of the existing one.
- **Smell:** a design that grows a new `switch`/`if`-arm per type; "to add X you edit
  function Y."
- **Fix:** polymorphism, a lookup table, or a registry so new cases are additive.

### Substitutability
Every variant honors the contract its callers rely on; no caller needs to know which variant
it holds.
- **Smell:** an implementation that throws on or silently no-ops part of the interface;
  callers that type-check the concrete variant before acting.
- **Fix:** rethink the hierarchy, or narrow the interface to what all variants truly share.

### Interface segregation
A client depends only on what it uses.
- **Smell:** a fat interface whose implementers stub half its methods; a component pulled
  into depending on a large module for one function.
- **Fix:** split into role-specific interfaces sized to each client.

### DRY / single source of truth
Each piece of knowledge — a rule, a constant, a shape — has one authoritative definition.
- **Smell:** the same logic or value appears in two design components or two plan tasks;
  parallel structures that must be changed together to stay correct.
- **Fix:** name it once and reference it.
- **Counter:** do not merge things that are only incidentally alike today; that couples them
  for no reason.

### Right-sized abstraction (YAGNI)
Structure matches real, present need — and no more.
- **Smell:** a layer, generic, config knob, or extension point with exactly one caller and no
  requirement asking for a second.
- **Fix:** cut it; add the seam when the second case actually arrives. This is the
  counterweight to every principle above — apply them to remove concrete pain, never to
  speculate.

### Intention-revealing names
Names state purpose, and units where relevant.
- **Smell:** `data`, `manager`, `helper`, `process()`, boolean flags whose meaning you must
  trace the code to recover.
- **Fix:** rename to the domain concept the reader is looking for.

### Explicit error and edge handling
Failure modes are designed, not incidental.
- **Smell:** a design with only a happy path; a plan task whose acceptance criteria never
  mention an error or edge case; errors that get swallowed or flattened into strings.
- **Fix:** enumerate failure → expected behavior, and turn each into a testable acceptance
  criterion.

### Complexity budget
Prefer the simplest structure that solves the actual problem; watch size, nesting, and
indirection.
- **Smell:** a planned function that will plainly outgrow a screen or nest past a few levels;
  a design carrying more layers of indirection than the problem has moving parts.
- **Fix:** decompose, flatten with early returns, or remove the indirection.

## The two artifacts this judges

- **`design.md`** — decomposition, boundaries, and dependencies: the structure the code
  inherits. This is the highest-leverage place to apply the rubric.
- **`plan.md`** — whether the tasks preserve that structure, keep each unit independently
  testable, and whether any code snippet in the plan itself models the clean shape rather
  than a shortcut the coder will copy.

## Dependency-mode boundaries

Keep approval ownership outside execution. A scope reservation cannot introduce a new dependency, public contract or security-policy change; require owner-approved re-planning instead.
