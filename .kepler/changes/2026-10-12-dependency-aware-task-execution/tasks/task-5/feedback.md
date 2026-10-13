---
artifact: feedback
change: 2026-10-12-dependency-aware-task-execution
task: 5
created: 2026-10-13
status: open
decision: rejected
---

# Code Feedback: Task 5 — Update goal-driven workflow resources

## Pass 1 — 2026-10-13

Base: cd002589a249f8492f027952699b651e43e01966
Head: 293001107ebabad60f04c7e9dd322f628f87d871
Verdict: changes-requested

### Blocking

- [skills/kepler-plan/SKILL.md:262; skills/kepler-code/SKILL.md:26-27] V2 still requires every task to capture Files, and the inline-task form requires Files even though v2 makes Files optional guidance. Make those requirements legacy-only and allow a valid v2 task/inline block without Files; add a contract assertion that distinguishes this behavior (violates: Task 5 acceptance, goal-driven task contract).
- [skills/kepler-plan/SKILL.md:496,516; skills/kepler-code/SKILL.md:3] The self-review checklist still requires Steps to be executable "with no further design" and says the coder adds no design, while the code skill description says it follows Steps exactly. These unscoped rules contradict v2 bounded judgment. Scope them to historical serial mode and keep the v2 Goal/Acceptance-bounded judgment explicit; add a regression check for the mode distinction (violates: Task 5 acceptance, bounded-judgment contract).
- [skills/kepler-orchestrate/references/implementer-prompt.md:36,47] The generic dispatch still requires an execution-selection slot and says every task must be the current selected slot, with predecessor approval supplied. That is a serial gate conflicting with dependency-mode ready-set dispatch and compatible concurrent lanes. Make slot/predecessor fields and checks historical-version-1-only; for v2 bind the verified ready projection and admission instead, and test that distinction (violates: Task 5 acceptance, dependency readiness and isolated execution).
- [skills/kepler-orchestrate/SKILL.md:20; bundle/templates/plan.md:29] Both resources still state without mode qualification that code owns implementation/root status and updates its task's root row, contradicting the new v2 coordinator-owned publication contract. Scope those statements to legacy serial execution and state that v2 workers publish task-local evidence only; add a resource-contract assertion against the conflicting generic wording (violates: Task 5 acceptance, root ownership).
- [skills/kepler-orchestrate/references/implementer-prompt.md:108-111] V2 instructions require truthful `interrupted` and `unavailable` worker responses, but the required-output schema permits only `done | blocked`. A worker therefore cannot follow both instructions without misreporting or omitting its actual response. Make the output mode-aware and represent interrupted/unavailable as nonterminal worker responses, with a contract test (violates: Task 5 acceptance, truthful interruptions and explicit outcome routing).

### Suggestions

- None.

## Pass 2 — 2026-10-13

Base: cd002589a249f8492f027952699b651e43e01966
Head: e82f5fc5e31dee82c28fb334b4d1d67e332f3aeb
Verdict: changes-requested

### Blocking

- [bundle/templates/README.md:106] The artifact-location guide still says without a mode qualification that Kepler-code updates its assigned root row, which contradicts the v2 coordinator-owned root-publication contract described immediately below. Qualify code-owned root-row updates as legacy serial behavior, state that v2 workers only write task-local evidence while the coordinator publishes root status, and add a contract assertion for this README wording (violates: Task 5 acceptance, root ownership).
- [.kepler/changes/2026-10-12-dependency-aware-task-execution/tasks/task-5/progress.md:47] The latest attempt's Modified list omits seven paths changed by its correction commit: `bundle/templates/plan.md`, `skills/kepler-orchestrate/SKILL.md`, `skills/kepler-orchestrate/references/implementer-prompt.md`, `skills/kepler-plan/SKILL.md`, `tests/skills/orchestrate-contract.test.ts`, `tests/skills/plan-tdd-contract.test.ts`, and `tests/skills/planning-resources-contract.test.ts`. Record the complete attempt path set in its task-local evidence before claiming the attempt is fully documented; the current list is not an accurate inventory of the 10-path correction commit (violates: Task 5 acceptance, truthful task-local attempt evidence and project workflow contract).

### Suggestions

- None.
