---
artifact: feedback
change: 2026-09-12-lint-skill-scripts
task: 25
created: 2026-09-17
status: open
decision: accepted
---

# Code Feedback: Task 25 — Document the review transition contract

## Pass 1 — 2026-09-17

### Blocking

- [.hamilton/specs/artifact-templates.md:35, .hamilton/specs/review.md:11, .hamilton/specs/workbench.md:39] The canonical specifications still say that every pass carries `Base`, `Head`, and `Verdict`, which contradicts the approved transition contract where a legacy prefix is structural and has no verdict provenance. Qualify these blanket statements so only fully evidenced passes carry those fields and structural legacy records remain explicitly provenance-free. (violates: canonical specifications define the same three history modes and distinguish structural legacy history from fully evidenced verdict records)
- [.hamilton/specs/artifact-templates.md:78, .hamilton/specs/review.md:58, docs/sdd-framework.md:137, docs/skills.md:220] The new wording says full commit identifiers are stored in `Base`, `Head`, and `Verdict`, but `Verdict` is an enum rather than a commit identifier. State that `Base` and `Head` contain full commit identifiers and that `Verdict` contains the allowed verdict value everywhere this wording appears. (violates: preserve full SHA requirements without misdescribing verdict evidence)
- [tests/docs/workbench-docs.test.ts:56] The added contract assertions run against one concatenated string, so one compliant document can satisfy them while another touched specification retains contradictory language, as the preceding findings demonstrate. Assert the required transition semantics and prohibited legacy claims on the relevant specification and framework-document sets individually so the tests fail on per-document contract drift. (violates: documentation contract tests cover the transition semantics)

### Suggestions

- None.

## Pass 2 — 2026-09-17

Base: c4666cc6b2660fbd9345ae29832da5ec09745fa8
Head: 52012a7507fdee066fd72d563198a8aa7cb93314
Verdict: approved

### Blocking

- None.

### Suggestions

- None.

## Pass 3 — 2026-09-17

Base: c4666cc6b2660fbd9345ae29832da5ec09745fa8
Head: 15b31b17ee05f7a587c87f4aaa595975e1fd5ce6
Verdict: approved

### Blocking

- None.

### Suggestions

- None.
