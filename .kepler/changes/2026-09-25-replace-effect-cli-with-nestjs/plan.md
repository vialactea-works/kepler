---
artifact: plan
change: 2026-09-25-replace-effect-cli-with-nestjs
status: approved
created: 2026-09-25
author: Caio Ferreira <caiorcferreira@gmail.com>
decision: accepted
route_unit: null
---

# Plan: Replace Effect-TS in the CLI with NestJS

## Overview

- Re-plan: The 2026-09-27 whole-branch review confirmed a baseline parser regression: independent child Commander instances accepted surplus positional arguments and dispatched setup or workbench use cases. Task 24 adds parser-level rejection and no-dispatch regression coverage under the accepted requirements; this same-change remediation does not bump the synchronized `0.9.0` version.

- Re-plan: Finish-work's Tasks gate was the only failed precondition: already-approved Tasks 14 and 23 record the exact unbulleted `Outcome: done` field, while `recordFields` currently reads only `- Field:` lines. Task 25 adds compatibility for task-progress attempt evidence without rewriting those histories or changing the CLI contract or version.
- Change: `.hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs/`
- Goal: Replace the Effect CLI and operation orchestration with a NestJS/`nest-commander` application and injectable setup and workbench use cases, retaining the canonical distribution and workbench contracts except for the approved removal of Effect-generated flags and the corrected setup failure status. Follow `design.md` and both requirements deltas; the canonical specs remain the behavioral baseline.
- Test: `bun --bun vitest run`
- Build / typecheck: `bun run build`
- Context notes: `src/cli/commands/setup.ts` and `workbench.ts` currently hold Effect adapters; six private `src/workbench/` modules expose free-function operations and typed runtime ports. Use `.js` ESM imports, pinned dependency versions, no code comments, real temporary filesystem/Git fixtures, and explicit Nest tokens for TypeScript interface ports. Keep Bun and the single-package layout. Use the existing four release targets. The confirmed release version is `0.9.0`.
- Quality notes: Each service and command task owns one use case or adapter with replaceable ports. During migration, old CLI functions may delegate to the new service so the installed CLI remains usable between tasks; they must contain no independent operation policy and Task 19 removes them. Shared reporting and runtime composition each have a single owning task. Pure artifact parsing and validation stay independent of Nest; do not create a universal runtime registry. This bounded temporary delegate is the only accepted migration indirection. Task 18 changes the one root dispatch seam after the independent service and command contracts are tested; its multiple subprocess assertions cover that single cutover rather than bundling separate use cases. Re-plan note: Task 19 includes `tests/workbench/lint.test.ts` because the baseline search found its explicit `lint`/`lintScope` compatibility assertion; remove only that obsolete assertion and imports while retaining service-level behavior coverage. Re-plan note: Task 22 externalizes five optional Nest peer packages during Bun compilation because Bun 1.4.0 cannot resolve their dynamic imports otherwise. The staged CLI binary passed current command smoke paths with these peers unloaded and without Bun, Node, or checkout fallback; future use of those optional Nest adapters requires bundling their dependencies and extending smoke coverage.

## Tasks

### Task 1: Pin Nest runtime and compiler support

- Depends on: none
- Files:
  - Created: `tests/cli/nest-metadata.test.ts`
  - Modified: `package.json`, `bun.lock`, `tsconfig.json`, `vitest.config.ts` only if Vitest needs explicit decorator metadata transformation
  - Deleted: none
- Acceptance:
  - The Nest command library and container load in Bun/Vitest, recognize an explicitly injected token, and emit usable metadata without an HTTP adapter; this establishes the `cli-distribution` Nest command runtime scenario.
  - Pin `@nestjs/common`, `@nestjs/core`, and `@nestjs/testing` to `12.1.0`, `nest-commander` to `3.21.0`, `reflect-metadata` to `0.2.2`, `rxjs` to `7.8.2`, and the required `@types/inquirer` peer to `8.2.13`. Keep Effect packages temporarily until Task 20.
- Steps:
  1. Red — write a test that checks emitted constructor metadata and resolves a decorated Nest provider through an explicit interface-port token. Run it before installation; missing Nest dependencies make the behavioral test impossible to execute, so also record the repeatable pre-change `bun -e 'import("nest-commander")'` failure rather than treating an import error as a behavioral assertion.
  2. Green — add the pinned runtime and test dependencies, regenerate the text lockfile with `bun install`, enable `experimentalDecorators` and `emitDecoratorMetadata`, and adjust Vitest's transformation only if the test demonstrates it is necessary. Run the new test and build until Nest resolves the token in Bun.
  3. Refactor — remove redundant configuration, retain explicit injection tokens for interface-typed ports, and rerun the focused test, full suite, and build.
  4. If the installed versions are incompatible with Bun, record the observed failure and re-plan the pin before changing the approved dependency choice; do not bypass metadata or the test.
- Verify: `bun --bun vitest run tests/cli/nest-metadata.test.ts && bun --bun vitest run && bun run build` → exit `0`, provider resolution succeeds, and the existing CLI suite stays green.
- Commit: `build: add pinned Nest CLI dependencies`

### Task 2: Add CLI result reporting

- Depends on: Task 1
- Files:
  - Created: `src/cli/nest/result-reporter.ts`, `src/cli/nest/result.module.ts`, `tests/cli/result-reporter.test.ts`
  - Modified: none
  - Deleted: none
- Acceptance:
  - One Nest-exported reporter writes structured workbench stdout/stderr without altering their order or content and sets `process.exitCode` to the result's `0`/`1`/`2`; this supports the `workbench` command contract and negative-result scenarios. Command handlers render operation-specific results, including lint, before reporting.
  - The reporter accepts substitute output/exit sinks in tests and owns no Git, filesystem, argument parsing, lint rendering, or use-case policy.
- Steps:
  1. Red — test positive and negative results with both output channels, plus an already-rendered lint string, against in-memory sinks; test module resolution and run the test before adding the reporter.
  2. Green — add the reporter with injected output/exit collaborators and a `ResultModule` exporting the provider for setup and workbench modules, then rerun the test.
  3. Refactor — remove duplicated stream handling, preserve the original result shapes, and rerun the focused test, full suite, and build.
  4. Repeat the phase cycle within this task if an output-channel regression appears.
- Verify: `bun --bun vitest run tests/cli/result-reporter.test.ts && bun --bun vitest run && bun run build` → exit `0`; stdout, stderr, and status match the fixtures.
- Commit: `feat: centralize CLI result reporting`

### Task 3: Extract setup service

- Depends on: Task 1
- Files:
  - Created: `src/cli/setup.service.ts`, `src/cli/setup-runtime.ts`, `src/cli/setup-settings.ts`
  - Modified: `src/cli/commands/setup.ts`, `tests/cli/setup.test.ts`
  - Deleted: none
- Acceptance:
  - An `@Injectable` `SetupService` owns directory creation, bundle resolution, template/guideline copying, and settings preservation through explicit role-sized filesystem/home and bundle-locator tokens; the old Effect command delegates to it temporarily, without retaining setup policy. This covers `cli-distribution` injectable setup and fresh/existing setup scenarios.
  - The service retains template listings and error messages, keeps `resolveBundleRoot`'s override/sibling/source order, leaves helper scripts untouched, and allows fake filesystem and bundle collaborators in tests. Pure settings YAML generation remains a function outside Nest.
- Steps:
  1. Red — migrate a fresh/existing setup test and a bundle/filesystem failure test to construct `SetupService` with substitute runtime ports; run `tests/cli/setup.test.ts` before adding the service and record the missing-service failure.
  2. Green — move setup orchestration and pure settings YAML generation out of the Effect command, provide production runtime collaborators, and make the temporary command delegate to the service. Preserve all existing tests and rerun the focused test.
  3. Refactor — remove Effect types from the use-case layer while leaving only the temporary CLI adapter, preserve `buildSettingsYaml` tests at its new path, and run focused tests, full suite, and build.
  4. Repeat the cycle here for any changed setup output or settings behavior; do not change `src/cli/bundle-root.ts`'s lookup order.
- Verify: `bun --bun vitest run tests/cli/setup.test.ts tests/cli/bundle-root.test.ts && bun --bun vitest run && bun run build` → exit `0`; fake ports and real temporary-home cases both pass.
- Commit: `refactor: move setup orchestration into a service`

### Task 4: Move isolation into IsolateService

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `src/workbench/isolate.ts`, `tests/workbench/isolate.test.ts`
  - Deleted: none
- Acceptance:
  - `IsolateService.execute(IsolationArguments)` owns check/create/verify dispatch, uses an explicit `IsolationRuntime` injection token, and preserves `IsolationResult` and all `0`/`1`/`2` behavior, including refusal to mutate a nested/existing worktree. The current CLI functions delegate temporarily; see `workbench` injectable use-case and command-contract scenarios.
- Steps:
  1. Red — migrate representative check/create/verify tests to construct `IsolateService` with a fake or temporary Git/runtime port; run the focused test and observe that the service contract is absent.
  2. Green — move operation dispatch into the injectable class, keep pure validation and Git adapter behavior unchanged, and have the legacy exported functions forward to the service until Task 19. Rerun the focused tests.
  3. Refactor — migrate remaining direct test callers to the service, keep render helpers pure, and rerun the focused test, full suite, and build.
  4. Repeat Red → Green → Refactor for a failing isolation edge case within this task's files.
- Verify: `bun --bun vitest run tests/workbench/isolate.test.ts && bun --bun vitest run && bun run build` → exit `0`; final verdict lines and mutation guards remain unchanged.
- Commit: `refactor: inject the isolation use case`

### Task 5: Move diff into DiffService

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `src/workbench/diff.ts`, `tests/workbench/diff.test.ts`
  - Deleted: none
- Acceptance:
  - `DiffService.execute(DiffArguments)` owns record/task/base/whole-change dispatch behind an explicit `DiffRuntime` token, preserves `DiffResult`, checkpoint immutability, ancestry checks, and output paths. The old free-function entry point delegates temporarily; see `workbench` injectable use-case and command-contract scenarios.
- Steps:
  1. Red — migrate a record and an invalid-ancestry test to construct `DiffService` with the existing fake Git/file ports; run the focused test and observe the missing service.
  2. Green — move the existing dispatch into the injectable class without changing checkpoint or packaging helpers; delegate the old entry point to it until Task 19 and rerun the test.
  3. Refactor — migrate remaining direct tests, preserve pure render/result helpers, and run focused tests, full suite, and build.
  4. Repeat the phase cycle here if the output path or checkpoint result regresses.
- Verify: `bun --bun vitest run tests/workbench/diff.test.ts && bun --bun vitest run && bun run build` → exit `0`; record, package, and failure cases retain their results.
- Commit: `refactor: inject the diff use case`

### Task 6: Move precondition into PreconditionService

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `src/workbench/precondition.ts`, `tests/workbench/precondition.test.ts`
  - Deleted: none
- Acceptance:
  - `PreconditionService.execute(PreconditionArguments)` uses an explicit `PreconditionRuntime` token and preserves clean-tree, test, review, freshness, and ancestry gate order and results, including a closed gate and a malformed latest review; see `workbench` injectable use-case and negative-result scenarios.
- Steps:
  1. Red — change one open-gate and one closed/malformed-evidence test to instantiate the service with `createPreconditionRuntime` overrides; run the focused test and observe the missing service.
  2. Green — move only the orchestration into the injectable class, retain independent gate and artifact modules, and delegate the old function to the service until Task 19.
  3. Refactor — migrate remaining tests to the service, keep `renderPreconditionResult` pure and existing gates ordered, then run focused tests, full suite, and build.
  4. Repeat the cycle here if a gate changes exit status or last line.
- Verify: `bun --bun vitest run tests/workbench/precondition.test.ts && bun --bun vitest run && bun run build` → exit `0`; gate verdicts and output order remain unchanged.
- Commit: `refactor: inject the precondition use case`

### Task 7: Move context into ContextService

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `src/workbench/context.ts`, `tests/workbench/context.test.ts`
  - Deleted: none
- Acceptance:
  - `ContextService.execute(ContextArguments)` uses an explicit `ContextRuntime` token and preserves deterministic pre-plan/split/legacy inventory, task/review standing, error statuses, and final summary lines; see `workbench` injectable use-case and command-contract scenarios.
- Steps:
  1. Red — migrate a pre-plan and a malformed-artifact test to call the service with injected runtime ports; run the focused test and observe the absent service contract.
  2. Green — put the existing one/all dispatch behind the injectable class, retain parser and review-evidence helpers, and delegate the old function until Task 19.
  3. Refactor — migrate remaining context tests, avoid moving artifact policy into Nest modules, and rerun focused tests, full suite, and build.
  4. Repeat the phase cycle here for any changed deterministic inventory or error rendering.
- Verify: `bun --bun vitest run tests/workbench/context.test.ts && bun --bun vitest run && bun run build` → exit `0`; split, pre-plan, and invalid formats agree with existing fixtures.
- Commit: `refactor: inject the context use case`

### Task 8: Move prototype into PrototypeService

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `src/workbench/prototype.ts`, `tests/workbench/prototype.test.ts`
  - Deleted: none
- Acceptance:
  - `PrototypeService.execute(PrototypeArguments)` uses an explicit `PrototypeRuntime` token and preserves mapped/standalone create-or-resume and verification, including refusal on invalid input or Git failure. Convenience entry points delegate temporarily; see `workbench` injectable use-case and command-contract scenarios.
- Steps:
  1. Red — move one create/resume and one failure test to service calls with injected Git ports; run the focused test and observe the missing service.
  2. Green — move operation dispatch into the injectable class, retain pure argument validation, and delegate old entry points until Task 19.
  3. Refactor — migrate remaining direct tests, preserve the final branch line, and run focused tests, full suite, and build.
  4. Repeat the phase cycle here if branch mutation or verification changes.
- Verify: `bun --bun vitest run tests/workbench/prototype.test.ts && bun --bun vitest run && bun run build` → exit `0`; create, resume, verify, and Git-failure cases pass.
- Commit: `refactor: inject the prototype use case`

### Task 9: Move lint into LintService

- Depends on: Task 1
- Files:
  - Created: none
  - Modified: `src/workbench/lint.ts`, `tests/workbench/lint.test.ts`
  - Deleted: none
- Acceptance:
  - `LintService.execute(LintScope)` uses an explicit role-sized lint dependency token and preserves recursive scoped traversal, symlink containment, deterministic findings, rendering, and `0`/`1`/`2` results. Old `lintScope`/`lint` entry points delegate temporarily; pure artifact reader/contracts remain Nest-free. See `workbench` injectable use-case, lint-scope, and invalid-scope scenarios.
- Steps:
  1. Red — move a file-scope and an invalid/escaping-symlink test to construct `LintService` with substitute dependencies; run the focused test and observe the missing service.
  2. Green — move orchestration behind the injectable class while retaining existing traversal and validation helpers; delegate temporary free-function entry points and rerun focused tests.
  3. Refactor — migrate all direct lint tests, preserve `renderLintResult` as a pure formatter, and run focused tests, full suite, and build.
  4. Repeat the phase cycle here if scope, order, or exit code differs.
- Verify: `bun --bun vitest run tests/workbench/lint.test.ts tests/workbench/artifact-contracts.test.ts && bun --bun vitest run && bun run build` → exit `0`; invalid scope performs no unrelated inspection.
- Commit: `refactor: inject the lint use case`

### Task 10: Compose workbench providers

- Depends on: Tasks 1, 2, 4, 5, 6, 7, 8, 9
- Files:
  - Created: `src/cli/nest/workbench.module.ts`, `src/cli/nest/workbench.command.ts`, `tests/cli/workbench.module.test.ts`
  - Modified: none
  - Deleted: none
- Acceptance:
  - A Nest `WorkbenchModule` resolves six distinct use-case services and their existing typed runtime port factories by explicit tokens; overriding one token changes only its operation's result. A `workbench` command reports usage exit `2` when no subcommand is selected; see the `workbench` provider and workbench-help scenarios.
- Steps:
  1. Red — write an actual Nest module test that resolves all six services, overrides one runtime token with a fake, and exercises the bare-group error; run it before creating the module and observe the missing composition.
  2. Green — register each service and factory/token provider, import the shared `ResultModule`, create the `@Command({ name: "workbench" })` group, and make its bare invocation report usage without calling an operation. Rerun the Nest integration test.
  3. Refactor — keep the module as composition only (no operation switch or universal runtime), then run focused tests, full suite, and build.
  4. Repeat the cycle within this task if a provider cannot be resolved or the fake does not affect the intended service.
- Verify: `bun --bun vitest run tests/cli/workbench.module.test.ts && bun --bun vitest run && bun run build` → exit `0`; all six services resolve and the override is observed.
- Commit: `feat: compose injectable workbench services`

### Task 11: Register Nest setup command

- Depends on: Tasks 2, 3
- Files:
  - Created: `src/cli/nest/setup.module.ts`, `src/cli/nest/setup.command.ts`, `tests/cli/setup.command.test.ts`
  - Modified: none
  - Deleted: none
- Acceptance:
  - A Nest-managed setup command accepts `--force`, injects `SetupService` and the result reporter, prints the existing success listing, and prints one `Setup failed: ...` error on stderr with exit `2` on bundle/filesystem failure; see `cli-distribution` injectable setup and setup-failure scenarios.
- Steps:
  1. Red — test a Nest-resolved command with fake setup runtime for success and failure before adding the command/module; observe that Nest cannot resolve the new command.
  2. Green — add `SetupModule` with the role-specific production bindings and shared `ResultModule` import, plus a focused `@Command({ name: "setup" })` handler; keep the old Effect command available until Task 18 and rerun the focused test.
  3. Refactor — remove duplicated rendering logic from the new handler, retain the existing success text and error prefix, and run focused tests, full suite, and build.
  4. Repeat this task's cycle if a failure reports success or duplicates its message.
- Verify: `bun --bun vitest run tests/cli/setup.command.test.ts tests/cli/setup.test.ts && bun --bun vitest run && bun run build` → exit `0`; real module resolution and both outputs pass.
- Commit: `feat: register injectable setup command`

### Task 12: Register isolate subcommand

- Depends on: Tasks 2, 4, 10
- Files:
  - Created: `src/cli/nest/isolate.command.ts`, `tests/cli/isolate-command.test.ts`
  - Modified: `src/cli/nest/workbench.command.ts`, `src/cli/nest/workbench.module.ts`
  - Deleted: none
- Acceptance:
  - The Nest `isolate` command preserves `--check`, `--verify`, `--change-dir`, title, their invalid combinations, and stream/exit behavior without performing a rejected operation; see `workbench` help, negative-result, and usage-error scenarios.
- Steps:
  1. Red — test a Nest-resolved handler with a substituted `IsolateService` for check, create/verify, and invalid combinations; run the focused test before registering the subcommand.
  2. Green — implement only the isolate argument adapter, add `@SubCommand` registration to the group/module, and rerun the test.
  3. Refactor — preserve one path to `IsolateService.execute`, avoid Git logic in the handler, and run focused tests, full suite, and build.
  4. Repeat the cycle here for any rejected combination that reaches the service.
- Verify: `bun --bun vitest run tests/cli/isolate-command.test.ts && bun --bun vitest run && bun run build` → exit `0`; CLI-only checks and output mapping pass.
- Commit: `feat: register Nest isolate command`

### Task 13: Register diff subcommand

- Depends on: Tasks 2, 5, 10
- Files:
  - Created: `src/cli/nest/diff.command.ts`, `tests/cli/diff-command.test.ts`
  - Modified: `src/cli/nest/workbench.command.ts`, `src/cli/nest/workbench.module.ts`
  - Deleted: none
- Acceptance:
  - The Nest `diff` command preserves `--record`, `--whole-change`, `--base`, `--change-dir`, `--task`, and `--out` modes and pre-service combination errors; see `workbench` command-contract and usage-error scenarios.
- Steps:
  1. Red — test record, explicit-base, and invalid combinations against a Nest-resolved handler with a substituted `DiffService`; run the focused test before registering it.
  2. Green — translate existing mode selection into typed `DiffArguments`, register the `@SubCommand`, and rerun the test without moving checkpoint policy into the handler.
  3. Refactor — share only CLI result reporting, retain all operation modes, and run focused tests, full suite, and build.
  4. Repeat the cycle here for any invalid combination that creates a checkpoint.
- Verify: `bun --bun vitest run tests/cli/diff-command.test.ts && bun --bun vitest run && bun run build` → exit `0`; mode selection and usage errors agree with the existing CLI.
- Commit: `feat: register Nest diff command`

### Task 14: Register precondition subcommand

- Depends on: Tasks 2, 6, 10
- Files:
  - Created: `src/cli/nest/precondition.command.ts`, `tests/cli/precondition-command.test.ts`
  - Modified: `src/cli/nest/workbench.command.ts`, `src/cli/nest/workbench.module.ts`
  - Deleted: none
- Acceptance:
  - The Nest command requires `--change-dir` and `--test-cmd`, accepts `--whole-change-waived`, forwards typed arguments to `PreconditionService`, and preserves open/closed gate exit codes and final lines; see `workbench` negative-result and usage-error scenarios.
- Steps:
  1. Red — test a Nest-resolved precondition handler with fake service for supplied and missing required values and a closed gate; run the focused test before registration.
  2. Green — register the subcommand with required options and forward to the service; keep gate decisions inside the service and rerun the test.
  3. Refactor — remove duplicate option validation and run focused tests, full suite, and build.
  4. Repeat the cycle here if a missing required value reaches the service.
- Verify: `bun --bun vitest run tests/cli/precondition-command.test.ts && bun --bun vitest run && bun run build` → exit `0`; open/closed/usage paths preserve codes.
- Commit: `feat: register Nest precondition command`

### Task 15: Register context subcommand

- Depends on: Tasks 2, 7, 10
- Files:
  - Created: `src/cli/nest/context.command.ts`, `tests/cli/context-command.test.ts`
  - Modified: `src/cli/nest/workbench.command.ts`, `src/cli/nest/workbench.module.ts`
  - Deleted: none
- Acceptance:
  - The Nest command preserves an optional change directory, `--all`, the rejected `--all` plus directory combination, and the deterministic structured output; see `workbench` command-contract and usage-error scenarios.
- Steps:
  1. Red — test one/all modes and the invalid combination with a Nest-resolved `ContextService` substitute; run the focused test before registration.
  2. Green — add only the context argument adapter and `@SubCommand` registration; rerun the focused test.
  3. Refactor — keep inventory classification inside `ContextService`, then run focused tests, full suite, and build.
  4. Repeat the cycle here if invalid input causes directory inspection.
- Verify: `bun --bun vitest run tests/cli/context-command.test.ts && bun --bun vitest run && bun run build` → exit `0`; one/all and invalid cases pass.
- Commit: `feat: register Nest context command`

### Task 16: Register prototype subcommand

- Depends on: Tasks 2, 8, 10
- Files:
  - Created: `src/cli/nest/prototype.command.ts`, `tests/cli/prototype-command.test.ts`
  - Modified: `src/cli/nest/workbench.command.ts`, `src/cli/nest/workbench.module.ts`
  - Deleted: none
- Acceptance:
  - The Nest command preserves mapped positional names, `--standalone`, `--verify`, mutually exclusive modes, and no mutation on invalid input; see `workbench` command-contract and usage-error scenarios.
- Steps:
  1. Red — test mapped, standalone, verify, and invalid combinations against a Nest-resolved handler with a fake `PrototypeService`; run the test before registration.
  2. Green — map CLI arguments to `PrototypeArguments`, register the subcommand, and rerun the test without moving branch logic into the handler.
  3. Refactor — keep only syntactic validation in the handler and run focused tests, full suite, and build.
  4. Repeat the cycle here if a conflicting mode triggers a branch mutation.
- Verify: `bun --bun vitest run tests/cli/prototype-command.test.ts && bun --bun vitest run && bun run build` → exit `0`; all modes and rejection paths pass.
- Commit: `feat: register Nest prototype command`

### Task 17: Register lint subcommand

- Depends on: Tasks 2, 9, 10
- Files:
  - Created: `src/cli/nest/lint.command.ts`, `tests/cli/lint-command.test.ts`
  - Modified: `src/cli/nest/workbench.command.ts`, `src/cli/nest/workbench.module.ts`
  - Deleted: none
- Acceptance:
  - The Nest command accepts exactly one of `--file` or `--change-dir`, preserves rendered finding order and success/findings/invalid-scope codes, and rejects both or neither without inspecting files; see `workbench` lint-scope and invalid-lint-scope scenarios.
- Steps:
  1. Red — test both valid scopes, both/neither selectors, and finding rendering with a Nest-resolved handler and fake `LintService`; run the test before registration.
  2. Green — register the subcommand, call the pure `renderLintResult` formatter in the handler, and send its output/code through the reporter; keep traversal in `LintService`, then rerun the test.
  3. Refactor — avoid a second scope validator outside the existing use case except CLI-only syntax checks, and run focused tests, full suite, and build.
  4. Repeat the cycle here if invalid selection reads any path.
- Verify: `bun --bun vitest run tests/cli/lint-command.test.ts && bun --bun vitest run && bun run build` → exit `0`; explicit scopes and output streams pass.
- Commit: `feat: register Nest lint command`

### Task 18: Switch root command dispatch

- Depends on: Tasks 10, 11, 12, 13, 14, 15, 16, 17
- Files:
  - Created: `src/cli/app.module.ts`, `src/cli/nest/root.command.ts`
  - Modified: `src/cli/main.ts`, `tests/cli/main.test.ts`, `tests/cli/workbench.test.ts`
  - Deleted: `src/cli/commands/setup.ts`, `src/cli/commands/workbench.ts`
- Acceptance:
  - Actual source CLI subprocesses run through `AppModule` and `CommandFactory.run` with `cliName: "hamilton"`, `version: VERSION`, and explicit `errorHandler`/`serviceErrorHandler`. Root no-argument message/help/version and all six workbench commands remain available; see `cli-distribution` Nest runtime, canonical version, CLI parser usage-error, and command-option scenarios.
  - Commander exits for help/version remain `0`; unknown command, option, missing value, retired Effect flag, or bare workbench yields one stderr error and `2` without invoking a service. Setup filesystem/bundle failures preserve the error prefix and exit `2`; existing workbench result streams/codes stay intact.
- Steps:
  1. Red — extend `tests/cli/main.test.ts` and `tests/cli/workbench.test.ts` with root no-argument/help/version, unknown command/option, missing required value, retired flags, setup failure using an invalid `HOME`, and a representative path per subcommand. Run these subprocess tests before changing `main.ts`; document the known baseline setup `0` and inherited flags.
  2. Green — compose `AppModule`, register `@RootCommand`, load `reflect-metadata` before bootstrap, pass canonical `VERSION` and explicit CLI name, throw Commander's exit override into the factory's service error handler to map `0`/`2` without duplicate output, and replace the entry point. Delete the unused Effect command files; rerun the same subprocess tests.
  3. Refactor — preserve the Bun shebang, root text, installed bundle lookup, and exact output streams; run focused tests, full suite, and build. Keep use-case policy in providers, not the root or parser handlers.
  4. Repeat the cycle here if Commander parses a malformed invocation as success or executes a use case after an error.
- Verify: `bun --bun vitest run tests/cli/main.test.ts tests/cli/workbench.test.ts tests/cli/setup.command.test.ts && bun --bun vitest run && bun run build` → exit `0`; real CLI subprocesses preserve the accepted contract.
- Commit: `feat: switch Hamilton CLI to Nest commander`

### Task 19: Remove legacy operation wrappers

- Depends on: Task 18
- Files:
  - Created: none
  - Modified: `src/workbench/isolate.ts`, `src/workbench/diff.ts`, `src/workbench/precondition.ts`, `src/workbench/context.ts`, `src/workbench/prototype.ts`, `src/workbench/lint.ts`, `tests/workbench/lint.test.ts`
  - Deleted: none
- Acceptance:
  - Only the six injectable services own workbench use-case entry points; `isolate`, `diff`, `precondition`, `context`, `prototype`, `lintScope`/`lint`, and convenience functions no longer provide a parallel public operation path. Pure result renderers and parsing/validation helpers remain unchanged; see `workbench` injectable use-case scenario.
- Steps:
  1. Red — a behavioral failure is technically impossible for removal of unused delegates without changing behavior. Before editing, run `rg -n '^export (const|function) (isolate|checkIsolation|createIsolation|verifyIsolation|diff|precondition|context|prototype|createPrototypeBranch|createStandalonePrototypeBranch|verifyPrototypeBranch|lintScope|lint)\b' src/workbench` and record the existing matches as the repeatable alternative check.
  2. Green — delete only the obsolete free-function orchestration/delegation exports, update `tests/workbench/lint.test.ts` to remove the compatibility-wrapper test and imports while retaining its `LintService` behavior tests, ensure Nest handlers and remaining direct tests use service methods, and rerun the search expecting no matches.
  3. Refactor — retain pure renderers and private helpers, run focused workbench tests, full suite, and build to prove no caller still depends on the old entry points.
  4. If compilation reveals an unmigrated caller, fix it within this task only if it falls in Files; otherwise stop for re-plan rather than leaving a compatibility facade.
- Verify: `! rg -n '^export (const|function) (isolate|checkIsolation|createIsolation|verifyIsolation|diff|precondition|context|prototype|createPrototypeBranch|createStandalonePrototypeBranch|verifyPrototypeBranch|lintScope|lint)\b' src/workbench && bun --bun vitest run tests/workbench && bun --bun vitest run && bun run build` → exit `0` and no obsolete exports remain.
- Commit: `refactor: remove legacy workbench entry points`

### Task 20: Remove Effect tooling

- Depends on: Tasks 18, 19
- Files:
  - Created: `tests/cli/effect-cleanup.test.ts`
  - Modified: `package.json`, `bun.lock`, `tsconfig.json`, `src/index.ts`
  - Deleted: none
- Acceptance:
  - No Effect runtime, language-service package, `prepare` hook, schema/plugin, or Effect-specific test adapter remains in active source, tests, manifests, scripts, lockfile, or TypeScript configuration; historical `.hamilton/changes/` records are untouched. This fulfills `cli-distribution` Effect-removal scenario.
  - `package.json` and `src/index.ts` both report the confirmed breaking-release version `0.9.0`.
- Steps:
  1. Red — add a static test for forbidden Effect imports/dependencies/scripts/schema and synchronized version, scoped to active project files; run it before removal and observe existing package/config references.
  2. Green — delete Effect packages and the `prepare` hook, remove the Effect TypeScript schema/plugin while retaining Nest decorator settings, set both version constants to `0.9.0`, and regenerate `bun.lock` with `bun install`. Rerun the focused test and build.
  3. Refactor — verify `bun install --frozen-lockfile` and the full suite; leave historic change records and unrelated dependencies alone.
  4. Repeat the phase cycle here if a transitive Effect package or build hook still leaks into the lockfile.
- Verify: `bun --bun vitest run tests/cli/effect-cleanup.test.ts && bun install --frozen-lockfile && bun --bun vitest run && bun run build` → exit `0`; active Effect references are absent and versions match.
- Commit: `build: remove Effect tooling and bump to 0.9.0`

### Task 21: Refresh project guidance

- Depends on: Task 20
- Files:
  - Created: `tests/docs/cli-migration.test.ts`
  - Modified: `AGENTS.md`, `README.md`
  - Deleted: none
- Acceptance:
  - Active guidance names the Nest command, injectable service, runtime-port, Bun binary, and Vitest conventions rather than obsolete Effect imports, errors, or options; user guidance documents retired `--completions`, `--log-level`, `--wizard` and setup failure exit `2`. See `cli-distribution` Effect-removal and installed-option scenarios.
- Steps:
  1. Red — write a documentation test asserting current Nest/Bun/port guidance, both breaking changes, and absence of Effect-specific guidance; run it before editing the documents and observe the old AGENTS content.
  2. Green — replace stale `AGENTS.md` architecture/test/error conventions and add a concise migration note to `README.md`, keeping the documented CLI commands and install instructions accurate; rerun the test.
  3. Refactor — remove redundant guidance, retain no-comment and `.js` ESM import conventions, and run documentation tests, full suite, and build.
  4. Repeat the cycle here if a CLI option or setup behavior is documented inconsistently.
- Verify: `bun --bun vitest run tests/docs/cli-migration.test.ts tests/docs/workbench-docs.test.ts && bun --bun vitest run && bun run build` → exit `0`; active guidance matches the implemented CLI.
- Commit: `docs: update Nest CLI and migration guidance`

### Task 22: Smoke-test standalone binaries

- Depends on: Task 20
- Files:
  - Created: `scripts/smoke-standalone.sh`
  - Modified: `.github/workflows/release.yml`, `.hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs/plan.md`
  - Deleted: none
- Acceptance:
  - The release matrix still compiles macOS x64/arm64 and Linux x64/arm64 with `bun build --compile`, externalizing the five optional Nest peers that Bun 1.4.0 cannot resolve during bundling. Linux x64 runs from a staged `bin/hamilton` with a sibling `bundle/`, `HAMILTON_BUNDLE_DIR` unset, and restricted runtime PATH, verifying exact version, root/workbench help, setup assets, a representative lint operation, and missing-bundle failure paths/status `2`; the tested CLI paths do not load those peers. See `cli-distribution` source/compiled version, installed standalone, missing-bundle, and setup-failure scenarios.
- Steps:
  1. Red — a failing unit test cannot exercise GitHub's cross-target release matrix locally. Record the pre-change workflow inspection showing only a version smoke check and capture the Bun 1.4.0 failure from the original compile command: it cannot resolve optional Nest peer dynamic imports. Compile a temporary Linux x64 binary with the five peers externalized and run the intended checks outside the checkout to prove those imports remain unused by the supported CLI paths before editing the workflow.
  2. Green — add a shell smoke script that stages `bin/hamilton` and sibling `bundle/` in a temporary directory, unsets `HAMILTON_BUNDLE_DIR`, removes Bun/Node from the execution PATH, checks positive paths, then removes the staged bundle and asserts the checked-path error with status `2` without falling back to checkout assets. Add `--external` for `class-transformer`, `class-validator`, `@nestjs/platform-express`, `@nestjs/microservices`, and `@nestjs/websockets` to every matrix compile and the local verification command. Do not add dependencies; these optional peers remain unloaded on supported CLI paths. Clean temporary files and invoke the script in the Linux x64 release job without changing the four build targets.
  3. Refactor — keep shell assertions explicit and non-destructive, run the script against a locally compiled Linux x64 binary, record the artifact size in task-local progress, then run full suite and build.
  4. Repeat the phase cycle here if bundle lookup unexpectedly falls back to the checkout or a failing setup reports success.
- Verify: `bun build --compile --target=bun-linux-x64 --external class-transformer --external class-validator --external @nestjs/platform-express --external @nestjs/microservices --external @nestjs/websockets src/cli/main.ts --outfile /tmp/hamilton-nest-smoke && bash scripts/smoke-standalone.sh /tmp/hamilton-nest-smoke && bun --bun vitest run && bun run build` → exit `0`; CI matrix names remain unchanged. Remove the temporary binary after verification.
- Commit: `ci: smoke-test standalone Nest binaries`

### Task 23: Publish versioned migration notes

- Depends on: Tasks 20, 21, 22
- Files:
  - Created: `docs/releases/0.9.0.md`, `tests/docs/release-notes.test.ts`
  - Modified: `.github/workflows/release.yml`
  - Deleted: none
- Acceptance:
  - The `0.9.0` release notes explicitly identify both breaking changes, preserve Bun standalone distribution instructions, and are selected by the publish job using the current package version rather than hardcoding these notes into future releases. Missing notes for a future version stop publication instead of reusing old notes; see `cli-distribution` installed-option and setup-failure scenarios.
- Steps:
  1. Red — write a test that resolves `docs/releases/${packageVersion}.md`, checks both approved breaking changes, and verifies the release workflow selects the file for that version; run it before creating the file and observe the missing notes/publish integration.
  2. Green — add the `0.9.0` note, make the release job check out the repository and require `docs/releases/${VERSION}.md` before calling `gh release create --notes-file` with that file, then rerun the focused test.
  3. Refactor — keep release notes specific to this version, preserve the existing artifact packaging and checksums, and run focused docs tests, full suite, and build.
  4. Repeat the cycle here if publish could use a stale note file or skip the required version check.
- Verify: `bun --bun vitest run tests/docs/release-notes.test.ts tests/docs/cli-migration.test.ts && bun --bun vitest run && bun run build` → exit `0`; the workflow points to the current version's notes and fails closed on missing notes.
- Commit: `docs: publish versioned 0.9.0 migration notes`

### Task 24: Reject surplus positional arguments

- Depends on: Tasks 11–18
- Files:
  - Created: none
  - Modified: `src/cli/nest/root.command.ts`, `tests/cli/main.test.ts`, `tests/cli/workbench.test.ts`
  - Deleted: none
- Acceptance:
  - Before command dispatch, the setup command, workbench group, and every workbench leaf reject surplus positionals with one parser usage error on stderr, empty stdout, and exit `2`; no setup or operation service runs. Cover setup and a positional passed directly to the workbench group, plus the zero-positional `diff`, `precondition`, and `lint` leaves, `context` with its optional `[change-dir]`, `isolate`'s optional `[title]` across check/create/verify modes, and `prototype`'s declared `[map-name] [ticket-name]` arity and option-only modes. Preserve every valid declared arity and the existing root no-argument message, root help/version, top-level unknown-command handling, and bare-workbench usage error. Use disposable temporary repositories for stateful isolate/prototype probes and assert that malformed calls create neither branches nor worktrees; use temporary output/marker paths to prove diff/precondition use cases did not run. This addresses `.hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs/requirements/cli-distribution.md`'s `CLI parser usage errors` / `Parse fails before command dispatch` and `Installed CLI command options` / `Hamilton-owned commands remain available` scenarios, plus `.hamilton/changes/2026-09-25-replace-effect-cli-with-nestjs/requirements/workbench.md`'s `Workbench command contract` / `Usage or environment error` and `Parser rejects malformed workbench invocation` scenarios.
  - Keep `package.json` and `src/index.ts` at the already-synchronized `0.9.0`; this is remediation within the same change, not another version bump.
- Steps:
  1. Red — extend the source-CLI subprocess coverage in `tests/cli/main.test.ts` and `tests/cli/workbench.test.ts` before changing command configuration. Use an invalid temporary `HOME` to distinguish parser rejection of `setup extra-arg` from a dispatched `SetupService` failure, and cover an extra argument passed to the workbench group while retaining the bare-group test. Exercise surplus arguments for each workbench leaf with otherwise valid inputs; prove dispatch did not happen by asserting no lint/context output, no diff output file, no precondition marker, and—inside disposable committed Git fixtures—no isolate branch/worktree or prototype branch. Keep positive controls for supported arities, including `context` with zero or one directory, `isolate` check and one-title create, `prototype`'s two mapped positionals and option-only modes, and the existing valid diff/precondition/lint paths. Assert every malformed call has exactly one stderr usage error, empty stdout, and status `2`.
  2. Green — apply the smallest parser-level correction in `src/cli/nest/root.command.ts`: configure excess-argument rejection on the nested command tree so it reaches setup and each independently constructed workbench descendant before parsing. Do not apply the setting to the root command itself; preserve its existing top-level unknown-command behavior. Do not add handler-level argument checks or change service contracts. Rerun the focused subprocess tests.
  3. Refactor — keep the traversal limited to parser configuration, confirm it reaches every registered leaf without changing root/help/version or bare-workbench handling, and rerun focused tests, the full suite, and the build. Confirm no worktree/branch, diff output, or marker was created by a rejected call and that the package/source version pair remains `0.9.0`.
- Verify: `bun --bun vitest run tests/cli/main.test.ts tests/cli/workbench.test.ts && bun --bun vitest run && bun run build` → exit `0`; focused assertions confirm every surplus-argument invocation returns one stderr usage error with status `2`, no stdout, and no use-case side effects, while valid commands and root behavior retain their existing results.
- Commit: `fix: reject excess CLI positional arguments`

### Task 25: Read legacy task outcome fields

- Depends on: Task 6
- Files:
  - Created: none
  - Modified: `src/workbench/artifact-body.ts`, `tests/workbench/precondition.test.ts`
  - Deleted: none
- Acceptance:
  - The precondition task gate opens for a committed `task-progress` attempt containing the exact historical unbulleted `Outcome: done` field and continues to open for the modern `- Outcome: done` field, preserving the committed task-evidence gate in `.hamilton/specs/workbench.md`.
  - Missing, non-`done`, and malformed outcome values still close the task gate. The compatibility path applies only to `task-progress` attempt fields; it does not alter other artifact records, append-only histories, review evidence, the CLI contract, or the synchronized `0.9.0` version.
- Steps:
  1. Red — add committed-fixture cases in `tests/workbench/precondition.test.ts` for the exact historical unbulleted success, the existing modern success, and missing, non-done, or malformed outcome fields. Run the focused test before production edits and confirm the historical success falsely closes the task gate while the negative cases remain closed.
  2. Green — update `src/workbench/artifact-body.ts` to recognize the exact unbulleted `Outcome: done` only in `task-progress` attempt fields, preserving the existing bulleted form and all other artifact/record parsing. Rerun the focused test.
  3. Refactor — keep compatibility scoped to task-progress attempts, confirm modern success and the missing, non-done, and malformed cases retain their outcomes, then rerun the focused test, full suite, and build.
  4. If a phase fails for the wrong reason, Verify fails, or feedback is `changes-requested`, record the correction and repeat Red → Green → Refactor within this task; block for re-plan if the correction exceeds Files or Acceptance.
- Verify: `bun --bun vitest run tests/workbench/precondition.test.ts && bun --bun vitest run && bun run build` → exit `0`; historical and modern success open the task gate, while missing, non-done, and malformed outcomes keep it closed.
- Commit: `fix: accept historical task outcomes`

## Done when

- All 25 active tasks are `done` in `progress.md`, with task-local Red, Green, and Refactor evidence (or a concrete alternative Red where specified).
- Each task has fresh committed `approved` feedback from `hamilton-code-feedback` before the next task or whole-branch review; requested changes return to that task for another verified pass.
- `bun --bun vitest run` and `bun run build` pass, and active files contain no Effect-TS runtime, tests, dependency, tooling, or guidance remnants.
- Four standalone Bun targets build; a staged Linux x64 binary works without Bun/Node or a source checkout for version, setup, workbench help, lint, and setup failure status `2`.
- The whole-branch `hamilton-review` is approved without blocking findings, `0.9.0` release notes are wired to publication, and `hamilton-finish-work` verifies the canonical-spec and release effects before closing the change.
