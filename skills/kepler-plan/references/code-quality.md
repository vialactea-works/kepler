# Code quality reference

Use this rubric to catch structural defects in designs and plans before implementation. The design's structure and the plan's task boundaries constrain the resulting code.

Binding design and standards remain authoritative. Workers use bounded judgment to meet Goal and Acceptance.

## How to use this

- Check each principle against `design.md` or a `plan.md` task and its snippets. A **smell** must have observable evidence in the text. Apply its **fix** before clearing the gate.
- **Scale scrutiny to the change.** A mechanical or one-file change needs less scrutiny than a new subsystem. Focus on decomposition and boundaries; do not add structure merely to satisfy a checklist.
- **Use the codebase's paradigm.** A "unit" means a module, class or function. In SOLID principles, an "abstraction" may be an interface, a passed function or an injected effect.

## Principles

Each entry states a principle, the **smell** to look for and the **fix**.

### Single responsibility (cohesion)
A unit has one reason to change.
- **Smell:** you cannot state a component's responsibility without "and" or a bulleted list; one plan task bundles unrelated changes.
- **Fix:** separate responsibilities that change independently, in both components and tasks.

### Low coupling / clear boundaries
Keep dependencies between units narrow.
- **Smell:** a component reaches into another's internals; a boundary passes a concrete, mutable data structure through; a described change ripples across many modules.
- **Fix:** hide internals behind a narrow interface so they can change without breaking consumers.

### Dependency inversion & testable seams
High-level policy depends on abstractions, not concrete details, and every unit has a seam where a test can substitute its collaborators.
- **Smell:** core logic names a concrete IO/DB/clock/network/randomness source directly; a plan task describes behavior that can only be exercised with real IO.
- **Fix:** inject the dependency behind an interface or parameter, and name the seam in the design so the plan can test against it.

### Open for extension
Add cases without changing existing branches.
- **Smell:** each new type requires another `switch` or `if` branch; "to add X, edit function Y."
- **Fix:** use polymorphism, a lookup table or a registry so new cases are additive.

### Substitutability
Every variant honors the contract its callers rely on; no caller needs to know which variant it holds.
- **Smell:** an implementation that throws on or silently no-ops part of the interface; callers that type-check the concrete variant before acting.
- **Fix:** rethink the hierarchy or narrow the interface to what all variants share.

### Interface segregation
A client depends only on what it uses.
- **Smell:** an interface whose implementers stub half its methods; a component that depends on a large module for one function.
- **Fix:** split into role-specific interfaces sized to each client.

### DRY / single source of truth
Give each rule, constant or data shape one authoritative definition.
- **Smell:** the same logic or value appears in two design components or two plan tasks; parallel structures that must be changed together to stay correct.
- **Fix:** name it once and reference it.
- **Counter:** keep incidentally similar concepts separate to avoid coupling unrelated responsibilities.

### Right-sized abstraction (YAGNI)
Limit structure to current needs.
- **Smell:** a layer, generic, config knob, or extension point with exactly one caller and no requirement asking for a second.
- **Fix:** remove it; add the seam when the second case arrives. Apply the principles above to solve concrete problems, not speculative ones.

### Intention-revealing names
Names state purpose and, where relevant, units of measurement.
- **Smell:** `data`, `manager`, `helper`, `process()`, boolean flags whose meaning you must trace the code to recover.
- **Fix:** rename to the domain concept the reader is looking for.

### Explicit error and edge handling
Design the expected behavior for each failure mode.
- **Smell:** a design with only a happy path; a plan task whose acceptance criteria never mention an error or edge case; errors that get swallowed or flattened into strings.
- **Fix:** enumerate failure → expected behavior, and turn each into a testable acceptance criterion.

### Complexity budget
Choose the simplest structure that solves the problem. Check size, nesting and indirection.
- **Smell:** a planned function that will outgrow a screen or nest beyond a few levels; more layers of indirection than the problem has moving parts.
- **Fix:** decompose, flatten with early returns, or remove the indirection.

## The two artifacts this judges

- **`design.md`:** Check decomposition, boundaries and dependencies before they constrain the code.
- **`plan.md`:** Check that tasks preserve the design's structure, keep units independently testable and provide code snippets that follow the same standards.

## Goal-bounded execution

Review task scope against Goal, Acceptance, approved intent and standards. Files guide discovery without excluding goal-serving paths. Reserve a new prerequisite's scope before editing, using an immutable record. Enforce the lifetime limits of two reservations and four concrete paths per reservation, with no refunds; block for re-planning when work exceeds those limits.
