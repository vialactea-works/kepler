---
artifact: review
change: 2026-09-25-replace-effect-cli-with-nestjs
created: 2026-09-27
status: open
decision: accepted
---

# Whole-branch Review: Replace Effect-TS in the CLI with NestJS

## Pass 1 — 2026-09-27

Base: 7a940c09efc36c19e9109185b68c4ad2ab833edf
Head: 62b1df5ab17a2c20221577435defabf94139199e
Verdict: changes-requested

### Blocking

- [src/cli/nest/root.command.ts:23-26] The migration applies `allowExcessArguments(false)` only to the `workbench` parent, while Nest Commander creates independent child Commander instances. Affected handlers including `src/cli/nest/setup.command.ts:22-27`, `src/cli/nest/lint.command.ts:39-56`, `src/cli/nest/context.command.ts:26-39`, and `src/cli/nest/prototype.command.ts:39-76` discard surplus parameters or consume only fixed indexes, so malformed invocations dispatch use cases instead of reporting a parser error. Focused checks confirmed that current `bun src/cli/main.ts workbench lint --file package.json extra-arg` exits 0 and runs lint, `HOME=/dev/null bun src/cli/main.ts setup extra-arg` reaches `SetupService`, and the pre-change source at the reviewed Base rejects the same surplus arguments with exit 2 and `Received unknown argument: 'extra-arg'`; an earlier prototype probe also created a branch from only its first two arguments. Configure excess-argument rejection recursively for the root and every nested command before parsing, and add no-dispatch parser coverage for `setup`, zero-positional leaves, `context`, `isolate`, and `prototype` (violates: `.hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs/requirements/workbench.md` Workbench command contract and usage-or-environment-error scenarios; `.hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs/requirements/cli-distribution.md` CLI parser usage errors and Installed CLI command options requirements).

### Suggestions

- None.

## Pass 2 — 2026-09-27

Base: 7a940c09efc36c19e9109185b68c4ad2ab833edf
Head: ff64e2ff6897e0495cd317a580a28392680b5a26
Verdict: approved

### Blocking

- None.

### Suggestions

- Focused verification passed: `bun --bun vitest run tests/cli/main.test.ts tests/cli/workbench.test.ts` (22 tests); retired Effect flags were confirmed to return one usage error with exit code `2`.

## Pass 3 — 2026-09-27

Base: 7a940c09efc36c19e9109185b68c4ad2ab833edf
Head: 2f29e1a3e5cf490e26ce5791fc26da8da4bee9b9
Verdict: approved

### Blocking

- None.

### Suggestions

- Focused verification: `bun src/cli/main.ts workbench lint --change-dir .hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs` exited 0 with every change artifact valid. `bun src/cli/main.ts workbench precondition --change-dir .hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs --test-cmd true` passed all 25 task gates and exited 1 only because Pass 2 predates material `64ee98375ea8e5f62ceee314175ac181aaf16679`; this pass records that material.
