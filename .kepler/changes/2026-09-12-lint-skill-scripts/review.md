---
artifact: review
change: 2026-09-12-lint-skill-scripts
created: 2026-09-13
status: complete
decision: accepted
---

# Whole-branch Review: Replace Hamilton Helper Scripts with the Workbench CLI

## Pass 1 — 2026-09-13

### Blocking

- None.

### Suggestions

- None.

## Pass 2 — 2026-09-17

Base: 728b2bdf9007dda1840b1f3c4cf06a35fe12e430
Head: 55b3c444a892fe9deabe6f1d2de870449904b96f
Verdict: changes-requested

### Blocking

- [src/workbench/review-passes.ts:761; skills/hamilton-review/SKILL.md:215; skills/hamilton-code-feedback/SKILL.md:169] The bounded compatibility mode cannot be transitioned into the required append-only per-pass history: removing global provenance and appending Pass 2 makes the preserved legacy Pass 1 fail its required Base, Head, and Verdict fields, while retaining global provenance makes every multi-pass history fail; the same rule leaves the existing multi-pass feedback histories for Tasks 3, 5, 7, 8, 9, 10, 11, 13, and 15 permanently malformed to the finish precondition. Focused verification with `bun run src/cli/main.ts workbench lint --file .hamilton/changes/2026-09-12-lint-skill-scripts/review.md` exited 1 and reported all three missing Pass 1 fields; `bun run src/cli/main.ts workbench precondition --change-dir .hamilton/changes/2026-09-12-lint-skill-scripts --test-cmd true` exited 1 and named those task reviews malformed. — Define and implement one append-only transition shape that preserves a validated legacy Pass 1 while making all subsequent provenance pass-local, then use it consistently in lint, context, precondition, and both producers (violates: binding re-plan amendment, composition, affected-consumer correctness).
- [.hamilton/changes/2026-09-12-lint-skill-scripts/progress.md:76] Root metadata still marks Tasks 18–21 `pending` while the body ledger marks them `done`, so the shared contract and finish precondition report four `progress metadata ledger does not match` failures. — Synchronize the durable frontmatter task statuses with the root ledger body (violates: execution-ledger integrity and finish-gate completeness).
- [.hamilton/changes/2026-09-12-lint-skill-scripts/tasks/task-21/progress.md:46] The physical latest Task 21 attempt records `Outcome: done` without the canonical list marker, but `recordFields` recognizes only `- Outcome: done`; the finish precondition therefore reports `Task 21 latest attempt is not done` despite the root row being done. — Preserve the existing attempts and append a complete next-numbered canonical done attempt with `- Outcome: done` and its evidence (violates: task-evidence integrity and the done-row invariant).
- [src/workbench/artifact-body.ts:455; src/workbench/artifact-body.ts:594] The shared progress-ledger parser rejects two valid preserved workflow shapes: `split("|")` treats a Markdown-escaped `\|` inside a title as a fourth cell, and the unconditional nonempty-record check rejects the header-only ledger required when every plan task is canonically abandoned. The focused in-memory `bun -e` `validateArtifactBody` check returned `invalid-record` plus `missing-section` for the escaped-title fixture and `missing-section` for the all-abandoned fixture. — Parse escaped table delimiters and unescape display titles, permit a zero-row progress ledger when plan comparison proves there are no active tasks, and restore both former-helper parity cases (violates: helper behavior preservation and `.hamilton/specs/execution.md:23`).
- [src/workbench/lint.ts:135; src/workbench/lint.ts:319] A file that passes `stat` but fails during `readFile` is converted from the reader's `read-failure` diagnostic into ordinary lint findings and exit 1, even though unreadable input paths are specified as environment errors with exit 2. Focused verification with an injected unreadable file returned `{"status":"findings","exitCode":1,"codes":["read-failure"]}`. — Promote reader I/O failures to the invalid-scope/environment-error result before artifact findings are classified and add focused coverage (violates: lint result semantics and `.hamilton/specs/workbench.md:43`).
- [src/workbench/isolate.ts:248; src/cli/commands/workbench.ts:41] Isolation stores operational failures in `stderr`, but its renderer returns only `stdout`, and the common CLI runner sends every rendered result through `Console.log`; consequently `bun run /Users/caioferreira/workspace/personal/hamilton/src/cli/main.ts workbench isolate --check` from `/tmp` exited 2 with no error text on either meaningful stream. — Render the populated error channel and preserve stdout/stderr routing at the CLI boundary, with an integration assertion for an operation failure (violates: preserved helper observability and stateful-failure reporting).

### Suggestions

- None.

## Pass 3 — 2026-09-17

Base: 728b2bdf9007dda1840b1f3c4cf06a35fe12e430
Head: ec89cc15cc680e348610b201a197da521b383f55
Verdict: approved

### Blocking

- None.

### Suggestions

- None.
