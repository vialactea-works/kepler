---
artifact: plan
change: 2026-09-21-refactor-wayfinder-route
status: approved
created: 2026-09-21
author: Caio Ferreira <caiorcferreira@gmail.com>
decision: accepted
route_unit: null
---

# Plan: Refactor the Wayfinder route

## Overview

- Change: `.hamilton/changes/2026-09-21-refactor-wayfinder-route/`
- Goal: Make `route.md` the self-contained, compiled outcome of Wayfinder: a clear description of the destination, the causal decision path that produced it, the boundaries builders must preserve, and the coarse delivery units that can realize it later.
- Test: `bun run test`
- Build / typecheck: `bun run build`
- Context notes: This change starts at the minimal planning path with no proposal, design, or requirement deltas. The current route contract is distributed across `.hamilton/specs/wayfinder.md`, `.hamilton/specs/artifact-templates.md`, `.hamilton/specs/glossary.md`, `.hamilton/specs/propose.md`, the Wayfinder template and skills, workbench validation, and framework documentation; each task names the complete slice it must keep consistent. The map remains the live exploration index and tickets remain detailed evidence and decision records. The route stops being another index: it synthesizes current truth while preserving ticket links for drill-down. Wayfinder still performs no implementation; downstream processes own construction and lifecycle transitions after the route is accepted. Route and unit lifecycle vocabularies, frontmatter fields, map mechanics, and the abstract executing-process contract remain unchanged. This is a re-plan after the durable whole-branch review recorded implementation gaps; the remediation tasks preserve the approved destination-first intent and correct only the reviewed seams.
- Quality notes: Tasks follow the contract boundaries inherited by the implementation: route semantics and vocabulary, artifact validation, template installation, route production, each route consumer, public documentation, and migration of the single worked route. Tasks 2 and 3 use explicit red→green test order. Markdown-only tasks use structural assertions because the repository has no behavioral harness for skill prose. Task 7 deliberately updates several documents together because they are parallel renderings of one public contract and leaving an intermediate commit would publish contradictory guidance. Task 8 remains one task despite the route’s length because it transforms one independently lintable artifact and splitting it would leave that artifact invalid between commits. The instructional HTML blocks in the template are artifact content following the repository’s established template idiom, not comments in TypeScript source. Remediation Tasks 9–12 are independently verifiable seams for the review’s validator, guidance, migrated-route handoff, and documentation-spacing findings; each names the edge case or structural assertion that prevents a happy-path-only fix.

## Tasks

### Task 1: Define the route semantics and vocabulary

- Depends on: none
- Files:
  - Created: none
  - Modified: `.hamilton/specs/wayfinder.md`, `.hamilton/specs/glossary.md`
  - Deleted: none
- Acceptance:
  - The canonical Wayfinder specification defines the map as the live exploration index, tickets as detailed decision records, and the route as the compiled current understanding of the destination and path chosen.
  - The route is self-contained at the outcome-and-constraints level; tickets remain the drill-down source for detailed evidence, rejected alternatives, and superseded reasoning.
  - Builder latitude is distinguished from unresolved fog: latitude contains choices that cannot change the destination, while unresolved product or architectural choices keep the map open.
  - Route units are coarse delivery boundaries rather than implementation tasks or designs.
  - The Wayfinder planning phase finishes when the route is accepted; downstream processes own construction and later lifecycle mutations.
  - The route-writing gate states that contradictions or essential ambiguity prevent map clearance and require another consistency pass or decision ticket.
  - The canonical glossary’s `route` definition states the new current meaning and no longer says that a route merely points without restating.
- Steps:
  1. Read the complete current `The route` behavior, examples, invariants, and decisions in `.hamilton/specs/wayfinder.md` together with the `route` and `change-sized unit` definitions in `.hamilton/specs/glossary.md`.
  2. Replace the index-only route contract with the compiled-synthesis contract while preserving the existing map lifecycle, route lifecycle, unit lifecycle, shipping ownership, and change-sized-unit boundary.
  3. Define the five required route sections: Point of departure, Destination, Path chosen, Shipping rules, and Units.
  4. Define the route-writing consistency gate: destination coherence, decision-to-destination traceability, unit coverage, causal dependencies, and boundary preservation.
  5. Rewrite the glossary’s route definition at the same altitude, preserving its established term-and-source format while replacing obsolete semantics.
- Verify: `rg -n "compiled|Point of departure|Builder latitude|Path chosen|consistency" .hamilton/specs/wayfinder.md .hamilton/specs/glossary.md && ! rg -n "points and does not restate|points; it does not restate" .hamilton/specs/wayfinder.md .hamilton/specs/glossary.md` → the canonical contract and glossary carry the new semantics and no obsolete index-only rule.
- Commit: `docs: redefine the wayfinder route contract`

### Task 2: Enforce the route artifact contract

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `.hamilton/specs/artifact-templates.md`, `src/workbench/artifact-body.ts`, `tests/workbench/artifact-contracts.test.ts`
  - Deleted: none
- Acceptance:
  - The artifact-template specification describes the existing route frontmatter and nested unit records rather than claiming that routes have no frontmatter.
  - Route bodies require Point of departure, Destination, Path chosen, Shipping rules, and Units.
  - A complete route using the existing frontmatter schema validates successfully.
  - A route missing any required top-level section fails with a stable `missing-section` diagnostic.
  - Destination subheadings and unit-local bold labels do not become workflow records or interfere with contiguous unit parsing.
  - Unit lifecycle state, dependencies, and backing ticket paths remain authoritative in frontmatter; no metadata schema or lifecycle enum changes.
- Steps:
  1. Update the route fixture in `tests/workbench/artifact-contracts.test.ts` to model all five sections, including Destination subheadings and a unit with bold local labels.
  2. Add focused cases that remove Point of departure, Destination, and Path chosen one at a time and expect `missing-section` while preserving the existing Shipping rules and Units coverage.
  3. Run `bun --bun vitest run tests/workbench/artifact-contracts.test.ts` and confirm the new missing-section cases fail against the current two-section contract.
  4. Extend the route body contract in `src/workbench/artifact-body.ts` with the three new required sections while preserving unit record parsing.
  5. Update `.hamilton/specs/artifact-templates.md` to describe the frontmatter-owned unit metadata and five-section body, removing its obsolete no-frontmatter and body-level status contract.
  6. Re-run the focused test and confirm all artifact contract cases pass.
- Verify: `bun --bun vitest run tests/workbench/artifact-contracts.test.ts` → all route body, missing-section, and unit-record cases pass.
- Commit: `feat: validate destination-first route bodies`

### Task 3: Replace the installed route template

- Depends on: Task 1, Task 2
- Files:
  - Created: none
  - Modified: `bundle/templates/wayfinder/route.md`, `tests/cli/setup.test.ts`
  - Deleted: none
- Acceptance:
  - The template uses Hamilton’s established route frontmatter: artifact identity, effort, route lifecycle, dates, decision, and nested unit records.
  - Frontmatter is the only source for unit identity, status, dependencies, and backing ticket paths.
  - The body contains the complete destination-first structure and makes clear that Wayfinder does not implement the units.
  - Decision entries use the compact choice/because/therefore/ticket-link form.
  - `hamilton setup` installs the route template byte-for-byte, and the installed content includes every required destination-first section.
- Steps:
  1. Extend `tests/cli/setup.test.ts` so the Wayfinder-template test compares the installed route template with `bundle/templates/wayfinder/route.md` and asserts that the installed content contains Point of departure, Destination, Path chosen, Shipping rules, and Units.
  2. Run `bun --bun vitest run tests/cli/setup.test.ts` and confirm the new section assertions fail against the current route template.
  3. Replace `bundle/templates/wayfinder/route.md` with the exact template below.
  4. Re-run `bun --bun vitest run tests/cli/setup.test.ts tests/workbench/artifact-contracts.test.ts` and confirm installation and artifact-shape checks pass.

```md
---
artifact: route
effort: <effort-name>
status: open | shipping | shipped
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
decision: accepted | rejected | skipped
units:
  - id: 1
    name: <unit-name>
    status: pending | in-progress | shipped
    depends_on: []
    backed_by:
      - tickets/NN-slug.md
---

<!--
  Route — the compiled outcome of a cleared Wayfinder map.
  Produced by: hamilton-wayfinder
  Lives at: .hamilton/maps/<effort>/route.md

  The body explains the destination and the causal path chosen. Tickets hold
  detailed evidence, rejected alternatives, and decision history.

  Unit identity, lifecycle, dependencies, and backing tickets live only in
  frontmatter. Downstream processes update lifecycle metadata without rewriting
  the synthesized body.

  Delete this comment block and every inline hint before finalizing.
-->

# Route — <Effort Name>

## Point of departure

<!--
  Describe in one short paragraph, or a few bullets, what was materially unclear
  when wayfinding began. Include only ambiguity that shaped the destination.
  This is orientation, not a chronological history.
-->

## Destination

### Outcome

<!--
  State what will be true when this destination is eventually built. Describe
  the intended result, not the implementation work or the Wayfinder process.
-->

### Concrete shape

<!--
  Make the destination imaginable to an agent that did not participate in
  wayfinding. Use only the representations that remove meaningful ambiguity:
  a walkthrough, examples, process flow, state model, component view, decision
  table, or another domain-appropriate model.
-->

### Guardrails and boundaries

<!--
  State the invariants, constraints, and explicit exclusions that future
  proposals and implementations must preserve.
-->

-

### Builder latitude

<!--
  Record choices deliberately left to propose, design, or implementation because
  they cannot change the destination. Do not place unresolved product or
  architectural decisions here; those are remaining fog and require tickets.
-->

-

## Path chosen

<!--
  Synthesize the decisions that define the destination. This is a causal path,
  not meeting minutes or ticket chronology.

  Each entry states:
  1. what was chosen or ruled out;
  2. why;
  3. what consequence binds the destination;
  4. where to inspect the full evidence.

  Include rejected branches only when their rejection establishes an important
  boundary. Current truth belongs here; superseded answers remain in tickets.
-->

- **<Decision name>.** Chose <choice> because <reason>. Therefore <binding consequence>. ([<ticket title>](tickets/NN-slug.md))
- **<Boundary name>.** Ruled out <option> because <reason>. Therefore <excluded behavior or scope>. ([<ticket title>](tickets/NN-slug.md))

## Shipping rules

<!--
  Describe how downstream processes execute the units: merge-back branch,
  commit and merge/PR conventions, and shipping-relevant operation rules carried
  from the map. Wayfinder defines these rules but does not perform the work.
-->

- Merge-back branch: `<branch from map>`
- <standing shipping rule>

## Units

<!--
  Units are coarse delivery boundaries. Each unit enters the downstream process
  once. They are not implementation tasks and do not prescribe design that
  belongs in propose, design, or plan artifacts.

  The matching frontmatter entry owns the unit's id, stable name, lifecycle
  status, dependencies, and backing ticket paths.
-->

### 1. <Unit name>

**Destination contribution:** <Name the part of the destination this unit makes real.>

<!--
  In one paragraph, explain what this unit delivers, why it forms one coherent
  change, and how it advances the destination. Describe outcome and intent, not
  implementation steps.
-->

**Done when**

- <Observable outcome proving this destination facet exists>
- <Relevant boundary or failure condition that must hold>

**Binding constraints**

<!--
  Restate only the decision consequences that directly constrain this unit.
  Link to tickets for detailed reasoning and alternatives.
-->

- <Constraint and its practical consequence> ([<ticket title>](tickets/NN-slug.md))
```

- Verify: `bun --bun vitest run tests/cli/setup.test.ts tests/workbench/artifact-contracts.test.ts` → the route template installs byte-for-byte and its instantiated structure satisfies the route body contract.
- Commit: `feat: add destination-first wayfinder route template`

### Task 4: Make Wayfinder synthesize the route

- Depends on: Task 1, Task 3
- Files:
  - Created: none
  - Modified: `skills/hamilton-wayfinder/SKILL.md`
  - Deleted: none
- Acceptance:
  - The closing act synthesizes the point of departure from the goal and ticket questions rather than writing a chronology.
  - The destination combines the map destination, current ticket answers, glossary terms, constraints, and out-of-scope boundaries into one coherent current view.
  - Wayfinder chooses a domain-appropriate representation only when it removes ambiguity; it does not require every route to carry flows, state machines, or tables.
  - Every Path chosen entry contains the choice, concise rationale, binding consequence, and ticket link.
  - Every unit names its destination contribution, observable completion outcome, and unit-specific binding constraints without prescribing implementation steps.
  - If synthesis exposes contradiction or essential ambiguity, Wayfinder keeps the map open and resolves the gap rather than writing the route.
  - The consistency gate checks decision coverage, destination coverage by units, causal dependency ordering, and scope boundaries without adding scores or a report section.
  - Format mechanics remain in the installed template and Map mechanics section rather than being duplicated throughout the skill.
- Steps:
  1. Read The route section, Map mechanics, the closing steps of Work through the map, and the final process-diagram node together before editing.
  2. Rewrite The route section around synthesis rather than indexing, and add the route-writing sequence for point of departure, destination, path, builder latitude, units, and consistency.
  3. Change the “reasoning stays in tickets” rule to “details stay in tickets; current rationale and consequence travel in the route.”
  4. Preserve the existing glossary fold, route lifecycle, unit status ownership, abstract executing-process boundary, and installed-template reference.
  5. Update the process diagram’s closing node and incoming label to represent synthesis plus its consistency gate.
  6. Read the edited route, mechanics, and process sections end-to-end to ensure no format fields escaped into non-mechanics prose and no index-only instruction remains.
- Verify: `rg -n "Point of departure|Builder latitude|Path chosen|binding consequence|consistency" skills/hamilton-wayfinder/SKILL.md && ! rg -n "does not restate|points.*does not" skills/hamilton-wayfinder/SKILL.md` → every synthesis obligation is present and no obsolete index-only rule remains.
- Commit: `feat: synthesize cleared maps into routes`

### Task 5: Make propose consume the synthesized route

- Depends on: Task 3, Task 4
- Files:
  - Created: none
  - Modified: `skills/hamilton-propose/SKILL.md`, `.hamilton/specs/propose.md`
  - Deleted: none
- Acceptance:
  - Map-aware propose still selects the first pending unit from route frontmatter and checks dependencies exactly as before.
  - The propose skill and canonical spec read Destination and Path chosen as primary context before drafting artifacts.
  - They read the selected unit’s destination contribution, goal, observable completion outcome, and binding constraints.
  - `backed_by` tickets become drill-down evidence used when deeper reasoning or rejected alternatives are needed, rather than the only place where usable context exists.
  - The canonical propose spec no longer describes body-level `Status:` or `Backed by:` fields; it matches the existing frontmatter contract.
  - The proposal remains responsible for converting one route unit into concrete why/what/how artifacts; the route does not replace propose.
- Steps:
  1. Read the map-aware entrypoint and context-loading behavior in both the skill and canonical spec, identifying every reference to the old body-level route shape.
  2. Preserve map detection, worktree isolation, dependency checks, frontmatter status flips, no-pending behavior, and `route_unit` provenance.
  3. Rewrite map-aware context loading around the synthesized route body, then make `backed_by` navigation deliberate drill-down rather than mandatory reconstruction of every decision.
  4. Update `.hamilton/specs/propose.md` to the same public route contract, replacing its stale `### N.` / `Status:` / `Backed by:` parsing description with frontmatter selection plus body synthesis.
  5. Ensure clarifying dialogue concentrates on implementation-facing choices and does not relitigate committed route decisions unless it identifies a contradiction that must return to Wayfinder.
  6. Read both files end-to-end and compare their map-aware behavior sentence by sentence.
- Verify: `rg -n "Destination|Path chosen|destination contribution|backed_by" skills/hamilton-propose/SKILL.md .hamilton/specs/propose.md && ! rg -n "plain-text|Backed by:.*line|### N.*Status:.*Backed by:" .hamilton/specs/propose.md` → primary route context and ticket drill-down are explicit, and obsolete body metadata is gone.
- Commit: `feat: make propose consume synthesized routes`

### Task 6: Make direct planning consume the synthesized route

- Depends on: Task 3, Task 4
- Files:
  - Created: none
  - Modified: `skills/hamilton-plan/SKILL.md`
  - Deleted: none
- Acceptance:
  - Direct map-aware planning uses the same route interpretation as propose.
  - Unit selection, dependency checks, worktree isolation, lifecycle flips, and `route_unit` provenance remain unchanged.
  - The plan treats the route’s destination and binding constraints as committed context while leaving implementation decomposition to `hamilton-plan`.
  - Backing tickets remain available for drill-down without forcing the planner to reconstruct the destination from ticket answers.
  - Builder latitude may be resolved during planning only when the choice remains local and cannot alter the destination.
  - A contradiction that prevents satisfying the route returns to Wayfinder rather than being silently designed around.
- Steps:
  1. Read Detect map-aware mode and Gather context together before editing so selection mechanics remain separate from context interpretation.
  2. Preserve the existing frontmatter-driven unit selection, dependency checks, worktree behavior, status flips, and provenance.
  3. Update Gather context to read Destination, Path chosen, and the selected unit body before optional ticket drill-down.
  4. Define the boundary between safe Builder latitude and a contradiction that must return to Wayfinder.
  5. Read the edited process and self-review sections end-to-end to ensure no new route format is duplicated outside the context-loading instruction.
- Verify: `rg -n "Destination|Path chosen|Builder latitude|backed_by|Wayfinder" skills/hamilton-plan/SKILL.md` → direct planning honors the synthesized route and its contradiction boundary.
- Commit: `feat: make planning consume synthesized routes`

### Task 7: Synchronize route documentation

- Depends on: Task 1, Task 3, Task 4, Task 5, Task 6
- Files:
  - Created: none
  - Modified: `.hamilton/specs/framework-docs.md`, `docs/skills.md`, `docs/sdd-framework.md`, `bundle/templates/README.md`, `CONTRIBUTING.md`
  - Deleted: none
- Acceptance:
  - User-facing documentation describes the route as Wayfinder’s compiled destination-and-path handoff rather than a lightweight unit index.
  - Documentation distinguishes the stable synthesized body from mutable lifecycle metadata.
  - The route’s five required body sections and frontmatter-owned unit state are documented consistently.
  - The boundary remains explicit: Wayfinder clears fog; propose and plan turn units into implementation artifacts; code and finish-work build and ship them.
  - The framework-docs canonical spec permits and requires the updated Wayfinder presentation.
  - No maintained documentation in scope retains the obsolete “points and does not restate” or static-list-only contract.
- Steps:
  1. Update `.hamilton/specs/framework-docs.md` with the destination-first Wayfinder handoff that the rendered docs must communicate.
  2. Update the Wayfinder entry in `docs/skills.md` and the optional pre-change-stage explanation in `docs/sdd-framework.md`.
  3. Update the route artifact ownership description in `bundle/templates/README.md` without duplicating its full template.
  4. Extend `CONTRIBUTING.md`’s Map mechanics section with the existing route frontmatter and stable-body/mutable-metadata ownership contract.
  5. Search all maintained documentation in scope for obsolete route language and reconcile every hit.
  6. Run the focused documentation test, then read the five edited documents together for terminology and lifecycle consistency.
- Verify: `bun --bun vitest run tests/docs/workbench-docs.test.ts && ! rg -n "points.*does not restate|static handoff listing" docs bundle/templates/README.md CONTRIBUTING.md .hamilton/specs/framework-docs.md && rg -n "compiled|destination|Path chosen" docs/skills.md docs/sdd-framework.md bundle/templates/README.md CONTRIBUTING.md .hamilton/specs/framework-docs.md` → documentation tests pass, obsolete language is absent, and the new contract is represented in every owning document.
- Commit: `docs: explain destination-first wayfinder routes`

### Task 8: Migrate the existing Wayfinder route

- Depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6
- Files:
  - Created: none
  - Modified: `.hamilton/maps/hamilton-wayfinder/route.md`
  - Deleted: none
- Acceptance:
  - The existing shipped route has valid route frontmatter containing all ten units, their shipped lifecycle state, dependencies, and backing ticket paths.
  - Point of departure, Destination, and Path chosen faithfully synthesize the existing map and resolved tickets without introducing new decisions.
  - Existing shipping rules, unit intent, dependencies, and historical meaning are preserved.
  - Every unit names its destination contribution, observable completion outcome, and binding constraints.
  - No body-level Status, Depends on, or Backed by metadata remains; those values exist only in frontmatter.
  - The migrated route passes `hamilton workbench lint` and serves as a realistic worked example of the template.
- Steps:
  1. Read the existing map, route, and every current ticket Answer before changing the route; consult superseded material only to avoid misrepresenting current truth.
  2. Build the complete frontmatter unit ledger from the existing ten unit sections, preserving each unit’s name, shipped status, dependencies, and backing tickets.
  3. Synthesize Point of departure, Destination, and Path chosen from committed decisions; do not turn git or ticket chronology into narrative.
  4. Rewrite each unit into destination contribution, goal, Done when, and Binding constraints while preserving its scope and constraints.
  5. Remove body-level lifecycle and dependency metadata only after the matching frontmatter entry is complete.
  6. Build the CLI, lint the migrated artifact, and compare all ten units against the pre-migration route to confirm no unit or dependency was lost.
- Verify: `bun run build && bun dist/cli/main.js workbench lint --file .hamilton/maps/hamilton-wayfinder/route.md && test "$(rg -c '^### [0-9]+\. ' .hamilton/maps/hamilton-wayfinder/route.md)" -eq 10` → lint succeeds and all ten units remain present.
- Commit: `docs: migrate the wayfinder route to the compiled format`

### Task 9: Require level-2 headings for route sections

- Depends on: Task 2
- Files:
  - Created: none
  - Modified: `src/workbench/artifact-body.ts`, `tests/workbench/artifact-contracts.test.ts`
  - Deleted: none
- Acceptance:
  - Route validation recognizes Point of departure, Destination, Path chosen, Shipping rules, and Units only when each appears as a level-2 `##` heading.
  - A route with a required section present only as a nested `###` heading fails with the existing stable `missing-section` diagnostic, while a route with all five level-2 headings and the existing unit parsing remains valid.
  - Validation behavior for non-route artifact section contracts is unchanged.
- Steps:
  1. Read the route body contract and the existing route fixture and missing-section cases in `tests/workbench/artifact-contracts.test.ts`.
  2. Add a regression case covering each required route section when its only occurrence is `### <section>`, asserting `missing-section` and the expected section name while retaining the valid level-2 fixture coverage.
  3. Run `bun --bun vitest run tests/workbench/artifact-contracts.test.ts` and confirm the nested-only regression fails against the current `level >= 2` implementation.
  4. Narrow route section presence validation to exact level-2 headings without changing unit parsing, diagnostics, or other artifact contracts.
  5. Re-run the focused test and build to confirm nested-only sections are rejected and the complete route contract remains valid.
- Verify: `bun --bun vitest run tests/workbench/artifact-contracts.test.ts && bun run build` → all artifact-contract tests pass, including nested-only regressions, and TypeScript compilation succeeds.
- Commit: `fix: require top-level route sections`

### Task 10: Keep representation guidance out of Builder latitude

- Depends on: Task 4
- Files:
  - Created: none
  - Modified: `skills/hamilton-wayfinder/SKILL.md`
  - Deleted: none
- Acceptance:
  - The route-writing sequence places domain-appropriate representation guidance under Destination/Concrete shape, where it describes representations that remove meaningful destination ambiguity.
  - Builder latitude is reserved for local choices that cannot alter the destination and does not contain the representation-selection instruction.
  - The contradiction and essential-ambiguity gate remains explicit and still prevents route writing when a destination-shaping choice is unresolved.
  - The approved route synthesis sequence, glossary fold, lifecycle mechanics, and installed-template boundary remain unchanged.
- Steps:
  1. Read the complete The route section, especially Destination, Builder latitude, and the consistency gate, and locate the current representation instruction.
  2. Move the representation guidance into the Concrete shape step and state there that it is used only to remove meaningful ambiguity; rewrite Builder latitude to cover only non-destination-changing local choices.
  3. Preserve the existing contradiction and essential-ambiguity gate and avoid adding format mechanics outside the installed-template and Map mechanics references.
  4. Read the edited The route section end-to-end and confirm the sequence has one authoritative location for representation guidance and one clear latitude boundary.
- Verify: `python3 -c 'from pathlib import Path; s=Path("skills/hamilton-wayfinder/SKILL.md").read_text(); concrete=s.index("**Concrete shape**"); latitude=s.index("**Builder latitude**"); assert concrete < latitude; assert "domain-appropriate representation" in s[concrete:latitude]; assert "cannot alter the destination" in s[latitude:]; assert "If that synthesis exposes a contradiction or essential ambiguity" in s'` → representation guidance occurs before Builder latitude, latitude is destination-preserving, and the ambiguity gate remains present.
- Commit: `fix: place route representation guidance correctly`

### Task 11: Make migrated-route ticket navigation optional

- Depends on: Task 5, Task 8
- Files:
  - Created: none
  - Modified: `.hamilton/maps/hamilton-wayfinder/route.md`
  - Deleted: none
- Acceptance:
  - The migrated route presents its synthesized body as primary context for propose and describes `backed_by` ticket links as optional drill-down for deeper evidence or rejected alternatives.
  - The route no longer describes following ticket links as part of the normal handoff or implies that consumers must reconstruct the destination from tickets.
  - The route frontmatter, ten units, unit lifecycle and dependency metadata, shipping rules, and existing ticket links remain unchanged except for the handoff wording.
- Steps:
  1. Read the route handoff, frontmatter ledger, and the route-aware context-loading contract in `skills/hamilton-propose/SKILL.md` and `.hamilton/specs/propose.md`.
  2. Rewrite only the handoff wording so the synthesized route body is primary and ticket navigation is optional for deeper evidence or rejected alternatives; do not introduce new decisions or alter the unit ledger.
  3. Compare the edited frontmatter and unit headings with the pre-change route shape, then inspect the handoff in context for self-contained destination, path, and unit guidance.
  4. Build the CLI and lint the migrated route to confirm the wording correction preserves the real route artifact contract.
- Verify: `bun run build && bun dist/cli/main.js workbench lint --file .hamilton/maps/hamilton-wayfinder/route.md && ! rg -n "follows its ticket links|follow its ticket links|ticket-first" .hamilton/maps/hamilton-wayfinder/route.md && rg -n "optional|deeper evidence|rejected alternatives|synthesized route|primary context" .hamilton/maps/hamilton-wayfinder/route.md` → the route lints successfully, no normal ticket-first handoff remains, and optional drill-down language is explicit.
- Commit: `fix: make route ticket drill-down optional`

### Task 12: Restore framework-docs skill-entry spacing

- Depends on: Task 7
- Files:
  - Created: none
  - Modified: `.hamilton/specs/framework-docs.md`
  - Deleted: none
- Acceptance:
  - The skill-entry example restores spaces after the comma between example step tags and before the following `then` clause, matching the established readability contract.
  - The framework-docs capability, route documentation contract, and all other canonical wording remain unchanged.
- Steps:
  1. Read the Skill entry shape paragraph and compare its punctuation with the established pre-change wording.
  2. Restore the spaces around the example punctuation without changing the documented entry shape or route contract.
  3. Read the paragraph and inspect the diff to confirm this is a documentation-only readability cleanup.
- Verify: `python3 -c 'from pathlib import Path; s=Path(".hamilton/specs/framework-docs.md").read_text(); assert "*(step 1, optional)*`, `*(optional pre-change planning stage)*`), a one-to-two-sentence intro, then` in s; assert "*(step 1, optional)*`,`*(optional pre-change planning stage)*`), a one-to-two-sentence intro, then` not in s'` → the canonical skill-entry example has the restored spaces and no stale punctuation remains.
- Commit: `docs: restore framework skill-entry spacing`

## Done when

- The route template, canonical Wayfinder, artifact-template, glossary, propose, and framework-docs specifications, producing skill, consuming skills, validator, and documentation agree on one destination-first contract.
- `route.md` alone lets a future agent explain the point of departure, destination, binding decision path, boundaries, builder latitude, next eligible unit, and that unit’s observable outcome.
- Essential ambiguity cannot be mislabeled as Builder latitude or hidden in a generated route.
- The existing Wayfinder route is migrated and validates successfully without changing route or unit lifecycle vocabularies.
- `bun --bun vitest run tests/workbench/artifact-contracts.test.ts tests/workbench/artifact-schemas.test.ts tests/cli/setup.test.ts tests/docs/workbench-docs.test.ts` passes.
- `bun run test` passes.
- `bun run build` passes.
- `git diff --check` passes.
- All review feedback has been addressed.
