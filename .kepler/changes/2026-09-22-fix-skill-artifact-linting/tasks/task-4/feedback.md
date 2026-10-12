---
artifact: feedback
change: 2026-09-22-fix-skill-artifact-linting
task: 4
created: 2026-09-23
status: open
decision: rejected
---

# Code Feedback: Task 4 — Gate canonical and Wayfinder artifact writers with lint

## Pass 1 — 2026-09-23

Base: 4a6f41e28d187692c1e5d9394db1bdbf50b4ff64
Head: f8582de0d7fec7c75a8d7e2e12527a5f9d604f67
Verdict: changes-requested

### Blocking

- [skills/hamilton-wayfinder/SKILL.md:78,100-113] Route closure explicitly folds the working glossary into the recognized canonical `.hamilton/specs/glossary.md`, but the added validation contract only lints maps, tickets, and routes and does not require configured Git author handling for that canonical mutation; a route-closing run can therefore hand off or commit an unlinted or incorrectly attributed canonical spec. Add the canonical-spec `--file` lint gate immediately after that mutation, preserve an existing author, and stop when `git config user.name` or `git config user.email` is unavailable. (violates: Task 4 acceptance — lint after every recognized canonical mutation and populate canonical authors from configured Git identity)
- [tests/skills/canonical-artifact-lint-contract.test.ts:62-69,100-152] The contract tests do not assert the Wayfinder canonical glossary output or its file-scoped canonical-spec lint/author gate, and they do not assert the domain-modeling canonical glossary lint despite that skill writing the recognized spec; removing either canonical-spec gate would still leave all three tests passing. Extend the writer/output matrix and ordering/author assertions to cover every canonical writer. (violates: Task 4 acceptance — tests cover every recognized-artifact writer)

### Suggestions

- None.

## Pass 2 — 2026-09-23

Base: 4a6f41e28d187692c1e5d9394db1bdbf50b4ff64
Head: 17a8d3a1f1a829ba28f1eadde26530bb37a6adca
Verdict: approved

### Blocking

- None.

### Suggestions

- None.
