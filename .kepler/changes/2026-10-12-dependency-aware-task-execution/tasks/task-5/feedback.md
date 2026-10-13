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
