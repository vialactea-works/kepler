---
artifact: review
change: 2026-09-21-refactor-wayfinder-route
created: 2026-09-21
status: open
decision: accepted
---

# Whole-branch Review: Refactor the Wayfinder route

## Pass 1 — 2026-09-21

Base: 2512f85a7e0ee092e9f4e3ab6f08bd761a949ffa
Head: 7eb1e1bc9177a20932252a771163308cac278a59
Verdict: changes-requested

### Blocking

- [src/workbench/artifact-body.ts:704-711] Route section validation accepts any heading at level 2 or deeper, so a malformed route can omit a required top-level `##` section and satisfy the contract with a nested `###` heading of the same text. Enforce level-2 headings for the route's five required sections and add a regression for nested-only sections (violates: Task 2 acceptance that route bodies require the five top-level sections and the approved exact destination-first contract).
- [skills/hamilton-wayfinder/SKILL.md:84] The route-writing sequence puts the instruction to choose a domain-appropriate representation under **Builder latitude**, although Builder latitude is restricted to local choices that cannot alter the destination. This can classify a destination-shaping representation or unresolved architectural choice as latitude and clear the map incorrectly. Move the representation guidance into Destination/Concrete shape and reserve Builder latitude for non-destination-changing local choices (violates: binding route semantics and Task 4 acceptance for the Builder latitude versus essential-ambiguity boundary).
- [.hamilton/maps/hamilton-wayfinder/route.md:113-116] The migrated route says propose "follows its ticket links" as part of the normal handoff, preserving the old ticket-first behavior even though the synthesized route body is now primary context and `backed_by` tickets are optional drill-down evidence. Rewrite this handoff to make ticket navigation optional for deeper evidence or rejected alternatives, so the worked route agrees with the new consumer contract and remains usable on its own (violates: Task 5 acceptance and the binding route self-containment/optional-drill-down boundary).

### Suggestions

- Focused verification: `bun --bun vitest run tests/workbench/artifact-contracts.test.ts tests/cli/setup.test.ts tests/docs/workbench-docs.test.ts` passed 81 tests, and `bun run build && bun dist/cli/main.js workbench lint --file .hamilton/maps/hamilton-wayfinder/route.md` passed with a valid route artifact.
- [.hamilton/specs/framework-docs.md:15] Restore spaces around the skill-entry example punctuation (`)*`, `then`) to improve readability, as noted by Task 7 feedback.

## Pass 2 — 2026-09-21

Base: 2512f85a7e0ee092e9f4e3ab6f08bd761a949ffa
Head: 28685192861a50fb1d43085fb4957d573a105c3c
Verdict: approved

### Blocking

- None.

### Suggestions

- Focused verification: `bun --bun vitest run tests/workbench/artifact-contracts.test.ts tests/cli/setup.test.ts` passed 65 tests.
