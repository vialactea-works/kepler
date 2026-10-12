---
artifact: task-progress
change: 2026-09-12-lint-skill-scripts
task: 24
status: done
updated: 2026-09-17
decision: accepted
---

# Task Progress: Task 24 — Teach review producers the transition

## Attempt 1 — 2026-09-17

- Outcome: done
- Created: none
- Modified: .hamilton/changes/2026-09-12-lint-skill-scripts/progress.md, bundle/templates/feedback.md, bundle/templates/review.md, skills/hamilton-code-feedback/SKILL.md, skills/hamilton-review/SKILL.md, skills/hamilton-orchestrate/references/code-feedback-prompt.md, skills/hamilton-orchestrate/references/whole-branch-review-prompt.md, tests/templates/artifact-contracts.test.ts, tests/skills/code-feedback-contract.test.ts, tests/skills/review-contract.test.ts, tests/skills/orchestrate-contract.test.ts, .hamilton/changes/2026-09-12-lint-skill-scripts/tasks/task-24/progress.md
- Deleted: none
- Verification: `bun --bun vitest run tests/templates/artifact-contracts.test.ts tests/skills/code-feedback-contract.test.ts tests/skills/review-contract.test.ts tests/skills/orchestrate-contract.test.ts` → 67 tests passed; `bun run build` → passed; `bun --bun vitest run` → 380 tests passed; `git diff --check` → passed.
- Notes: Added one shared producer transition contract across fresh templates, producer skills, and orchestration prompts. Legacy-global histories are validated, existing pass bodies are preserved byte-for-byte, only global Base/Head/Verdict metadata is removed during the first append, and a complete pass-local suffix is appended atomically. Transitioned and modern histories append normally; ambiguous or malformed boundaries fail closed. No live feedback/review artifact or PR-44-STATE.md was modified.
