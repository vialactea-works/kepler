---
artifact: design
change: 2026-09-25-replace-effect-cli-with-nestjs
status: draft
created: 2026-09-25
author: Caio Ferreira <caiorcferreira@gmail.com>
decision: accepted
route_unit: null
---

# Design: Replace Effect-TS in the CLI with NestJS

## Context

The CLI entry point currently composes `@effect/cli`, `@effect/platform-bun`, and Effect runtime operations. `setup` returns an Effect value, and `workbench` command handlers adapt parsed inputs to asynchronous operation functions and their structured results. The `src/workbench/` modules already separate use cases and expose Git, filesystem, process, and runtime seams; their tests exercise temporary repositories and explicit fake dependencies. The project also uses Effect-specific language-service dependencies and configuration that the refactor must remove.

Hamilton's release workflow builds self-contained Bun executables for macOS and Linux on x64 and arm64. The CLI must continue to locate the bundle from an environment override, an installed sibling, or the source checkout. The user chose `nest-commander` and the provider-oriented Nest architecture, accepting the wider migration from command adapters into injectable operation services. Effect currently supplies inherited `--completions`, `--log-level`, and `--wizard` options; these will be removed. Setup currently prints an error yet exits `0` on failure; the new CLI will return `2` instead.

## Goals / Non-Goals

**Goals**

- Use NestJS and `nest-commander` to bootstrap and dispatch all CLI commands.
- Make setup and each workbench operation available through a role-specific injectable service.
- Remove Effect-TS imports, package dependencies, test adapters, build hooks, TypeScript configuration, and active project guidance.
- Preserve documented CLI commands and options, root help/version, workbench results and output streams, and standalone Bun distribution, except for the explicitly retired Effect-generated flags and the corrected setup failure exit code.
- Keep operation policy and low-level artifact validation independent of CLI command parsing.

**Non-Goals**

- Do not change setup's filesystem or settings behavior, workbench operation semantics, or bundle resolution order.
- Do not add an HTTP server or an HTTP platform adapter.
- Do not rewrite historical `.hamilton/changes/` records.
- Do not introduce generic provider registries, plugin systems, or other extension points without a current requirement.
- Do not include the separate pnpm monorepo migration.

## Decisions

### Decision: Use NestJS with `nest-commander` as the CLI framework

- Choice: Bootstrap with `CommandFactory.run(AppModule, { cliName: "hamilton", version: VERSION, errorHandler, serviceErrorHandler })`, using the canonical `VERSION` from `src/index.ts`. Register the root with `@RootCommand` to preserve its no-argument message and root help, `setup` and the workbench group with `@Command`, and the six operations as `@SubCommand` classes under workbench, following [`nest-commander`'s command registration](https://jmcdo29.github.io/nest-commander/features/commander/) and [factory options](https://jmcdo29.github.io/nest-commander/api/#commandfactoryrunoptions). Pin a `nest-commander` version that supports `@RootCommand` (3.6.0 or later). The workbench group reports the existing usage error when invoked without a subcommand.
- Alternatives considered: Keep or write a separate argument parser around Nest's standalone application context; rejected because the user selected `nest-commander` to own command parsing and registration. Use Nest's HTTP application and platform adapter; rejected because Hamilton is a terminal CLI and does not serve HTTP.
- Rationale: `nest-commander` supplies command and option parsing while Nest supplies the application module and dependency-injection container. One framework owns command lifecycle and dependency resolution.

### Decision: Represent setup and workbench operations as injectable services

- Choice: Provide an `@Injectable` setup use-case class and one `@Injectable` class for each workbench operation. Command classes validate CLI-specific combinations, invoke only the matching service method with typed input, and hand its structured result to the CLI output adapter. Move the existing operation orchestration from exported free functions into those service methods, preserving input/result types. Migrate direct CLI and test callers, including isolate/prototype convenience functions, to the services rather than keeping free-function delegates that bypass them. Keep pure artifact parsers, validators, and other focused algorithms as framework-independent functions below the service boundary.
- Alternatives considered: Keep every operation as a free function and add only command classes; rejected after the user selected the provider-oriented approach. Put all six workbench operations into one generic service; rejected because each operation has distinct behavior, dependencies, and reasons to change.
- Rationale: The Nest container becomes the application composition boundary the user requested, while one provider per use case avoids a command manager with unrelated responsibilities. Retaining focused pure helpers keeps artifact and argument rules independently testable.
- Accepted trade-off: Provider migration touches every workbench operation even though its current functions already have test seams. Preserve result types and use-case boundaries, and verify each operation's current contract before changing its dependency wiring.

### Decision: Inject role-sized runtime ports

- Choice: Register production filesystem, bundle-location, process, and Git collaborators at the CLI module boundary and inject only the ports each setup or workbench service uses. Reuse existing typed runtime port shapes where they match; split an oversized dependency rather than injecting a universal mutable runtime object. Because TypeScript interfaces disappear at runtime, identify each role-sized port with an explicit Nest injection token and bind its production adapter in the owning module. Test modules override those tokens with fakes or temporary filesystem and Git implementations; service unit tests may construct a class with the same typed port directly.
- Alternatives considered: Call `node:fs`, `process`, and Git directly from operation services; rejected because those services would lose the explicit test seams already present. Inject one all-purpose runtime context into every service; rejected because it would couple unrelated operations and expose unused collaborators.
- Rationale: This maintains dependency inversion and prevents Nest-specific infrastructure from leaking into low-level artifact and result helpers.

### Decision: Preserve the Bun standalone release path

- Choice: Keep [`bun build --compile`](https://bun.sh/docs/bundler/executables) for the existing four target binaries and verify the Nest command application in both source execution and a compiled Linux x64 executable. Configure TypeScript decorator metadata required by Nest and load `reflect-metadata` before application bootstrap, remove the Effect language-service schema and plugin, and retain the existing `bun run build` and Vitest gates.
- Alternatives considered: Move releases to Node-based executables; rejected because the installed-binary contract requires a self-contained executable and the current release path is Bun-native. Keep Effect-specific TypeScript configuration solely for compatibility; rejected because the user requested its removal everywhere.
- Rationale: The framework changes without weakening distribution or retaining stale tooling. The integration smoke test makes decorator and dependency bundling behavior observable before release.

## Architecture & Components

| Unit | Responsibility | Interface and dependencies |
| --- | --- | --- |
| `src/cli/main.ts` | Start the Nest command application and map bootstrap failures. | Passes `cliName`, canonical `VERSION`, parser `errorHandler`, and command `serviceErrorHandler` to `CommandFactory.run`; owns no operation policy. |
| `src/cli/app.module.ts` | Compose the application's setup and workbench modules. | Imports the two command modules; contains no operation policy. |
| Setup command module and command | Register `setup`, parse `--force`, invoke setup service, and render success or one failure message. | Injects `SetupService` and the result reporter; errors set exit `2`. |
| Workbench command module and command classes | Register workbench and its six subcommands, parse documented arguments/options, validate CLI-only combinations, and report structured results. | Each subcommand injects only its operation service and the result reporter; bare workbench reports usage error `2`. |
| Setup service | Own setup orchestration: create Hamilton directories, resolve the bundle, copy templates and guidelines, and preserve existing settings behavior. | Injects bundle-location, home/filesystem, and settings dependencies through narrow ports. |
| Workbench operation services in `src/workbench/` | Own the existing `isolate`, `diff`, `precondition`, `context`, `prototype`, and `lint` orchestration, one `@Injectable` class per operation. | Each service exposes a typed operation method and receives only its operation's typed runtime ports by token; direct tests/callers migrate to service methods, while pure helpers remain functions. |
| Runtime provider modules | Adapt Bun/Node filesystem access and Git/process execution to the operation ports. | Bind named tokens in the owning Nest modules and support test overrides; do not decide workflow policy. |
| CLI result reporter | Write command stdout/stderr and set the process exit code. | Accepts output strings and an exit code; command handlers adapt structured results (including rendered lint findings); has no Git, filesystem, or parsing dependency. |

The successful operation flow is `process argv → CommandFactory → AppModule → command handler → injected use-case service → role-sized runtime ports → structured result → CLI result reporter`. `setup` follows the same path but renders its template list or a single failure message. The root without arguments prints its existing message; root help and `--version` terminate successfully before a use case runs. Parser errors terminate at the factory's `errorHandler` before any command handler, while command-level combination errors terminate at the handler; both return `2` without starting an operation.

### Quality Lens

Each module and class has one reason to change: root composition, one CLI command, one setup use case, one workbench use case, or one infrastructure adapter. Command handlers inject matching service classes; services depend on operation-specific typed ports bound by runtime tokens rather than concrete filesystem, process, or Git implementations. Test modules replace those tokens, and direct service tests use the same seams. The accepted cost is migrating direct callers/tests of the old free-function operations; retaining delegates would create a second use-case convention and weaken the provider boundary. Pure helpers and result types remain framework-independent so Nest decorators do not enter artifact parsing and validation. The design adds no universal runtime service, speculative plugin registry, or duplicate version constant.

## Data & Flow

1. `CommandFactory` loads `AppModule`, which registers `SetupModule` and `WorkbenchModule` and their runtime providers.
2. `nest-commander` parses the selected command and options. Root help/version end with status `0`; a parse error reaches the registered `errorHandler` and ends with status `2` before any operation; valid inputs reach the Nest-managed command handler.
3. The handler validates command-specific option combinations and calls the matching injected service with typed input.
4. The service executes its use case through injected ports and returns a structured result or a setup failure.
5. The result reporter writes stdout and stderr and sets `process.exitCode`; setup retains its success listing or existing error message with corrected failure status `2`, while lint renders its findings before reporting them.

## Error Handling & Edge Cases

| Failure | Behavior |
| --- | --- |
| Unknown command, unknown option, or missing option value | The factory's `errorHandler` receives Commander's exit override and throws the exit error to stop parsing. Its `serviceErrorHandler` recognizes that exit error, sets `process.exitCode` to `0` for help/version or `2` for usage, and does not duplicate output Commander already wrote to stdout/stderr. For an unrelated thrown command error it reports once on stderr and sets `2`; no use case runs after a parser error. |
| Valid parse with an invalid option combination, or bare `workbench` | The command handler writes one usage message to stderr, sets exit `2`, and does not call the operation service. |
| Workbench negative check or failed check | Preserve the service's `0`/`1`/`2` result, output streams, and final machine-readable line. |
| Setup bundle or filesystem failure | Report the existing `Setup failed: ...` message once on stderr, set exit `2` rather than the old `0`, and do not print a success listing. |
| Nest provider/bootstrap failure | Fail before executing a command, report one actionable error, and return code `2`. |
| Compiled binary cannot load decorator metadata or a bundled dependency | The release smoke test fails; do not publish a binary that cannot run its command tree. |
| Bundle is absent | Preserve the current checked-path error from bundle resolution with setup failure status `2`. |
| Retired Effect-generated global option | Reject `--completions`, `--log-level`, or `--wizard` as an unknown option with stderr usage error and exit `2`; omit them from help. |

## Testing Strategy

- Migrate direct unit tests of the old operation functions and setup Effect to service-method tests against injected fake ports or the existing temporary filesystem and Git fixtures; test isolate/prototype convenience paths through the same services. Keep artifact parser, contract, and result tests independent of Nest.
- Add Nest application integration coverage that starts the actual command modules, resolves each use-case service and its role-sized port tokens, and demonstrates a swapped provider affecting command behavior; do not prove injection merely by constructing command classes.
- Exercise the source CLI as a subprocess for exact root `--version`, the root's no-argument message, root and command help, `setup`, `workbench --help`, every workbench command's representative success/negative/error path, bare workbench, unknown command/option, missing required option value, invalid option combinations, output streams, and exit codes. Check that parse failures do not reach services; check that retired Effect-generated flags disappear from help and fail with `2`; reproduce setup filesystem and missing-bundle failures and assert stderr plus status `2`.
- Run `bun run build` and `bun --bun vitest run`; verify Effect packages, imports, scripts, schemas, and plugins are absent from active project files, and check the lockfile is regenerated.
- Compile all four release targets with the existing `bun build --compile` workflow. Run the Linux x64 binary's exact canonical version, help, setup with a sibling bundle, workbench help, a representative operation, and a failing setup path that exits `2`.
- Keep the `hamilton-code` and `hamilton-code-feedback` task gates, then use `hamilton-review` and `hamilton-finish-work` for branch review and finish verification.

## Constraints & Boundaries

- Always: pin new dependencies; keep `package.json` and `src/index.ts` versions synchronized; preserve the existing four binary targets and bundle layout; run the full Vitest suite and build before release.
- Never: retain Effect-TS packages or configuration in active project files; change workbench result semantics without an approved requirement change; let workflow judgment move from skills into the CLI.

## Risks / Trade-offs

- **The provider migration broadens a framework refactor across six workbench use cases.** Keep one provider per operation, retain typed results and focused helpers, and use the current integration tests as behavioral regression coverage.
- **Nest decorators and emitted metadata may behave differently in Bun source and compiled execution.** Set the required TypeScript decorator options, include `reflect-metadata` as required by the Nest runtime, and smoke-test the real compiled binary in CI.
- **Nest command parsing may differ at help, missing-argument, and invalid-option boundaries.** The factory's `errorHandler` uses Commander's exit override, which also observes successful help/version exits; throw that exit error to stop parsing, then map successful exits to `0` and usage errors to `2` in `serviceErrorHandler` without duplicating Commander's output. Capture the accepted command/option matrix in subprocess tests.
- **Nest dependencies may increase compiled binary size and cold-start cost.** Record the resulting Linux x64 artifact size during implementation; do not add a size limit without a user requirement.

## Migration / Rollout

No user data or installed settings format changes. The next release replaces the existing standalone executable with the Nest-based executable while retaining the sidecar bundle and install paths. Source contributors continue to use Bun; setup and workbench users retain documented command syntax. Breaking compatibility changes: Effect-generated `--completions`, `--log-level`, and `--wizard` options are removed, and a setup failure now exits `2` instead of `0`; call out both in release notes. The implementation updates the package version and `src/index.ts` together under the repository's release policy.
