---
artifact: proposal
change: 2026-09-25-replace-effect-cli-with-nestjs
status: approved
decision: accepted
author: Caio Ferreira <caiorcferreira@gmail.com>
created: 2026-09-25
route_unit: null
---

# Proposal: Replace Effect-TS in the CLI with NestJS

## Why

Hamilton's CLI currently uses Effect-TS for command parsing, runtime composition, error handling, and setup tests. The same CLI is distributed as standalone Bun-compiled binaries, so replacing the framework must remove Effect-specific application and tooling dependencies while retaining Hamilton's documented command contract and release format. The migration also makes two explicit compatibility changes: it retires Effect-generated global options and corrects setup's failure exit status.

## Goals & Success Criteria

- Implement every Hamilton CLI command with NestJS and `nest-commander`.
- Remove Effect-TS imports, dependencies, test adapters, language-service setup, TypeScript plugin configuration, and active project guidance.
- Preserve root, setup, and workbench command names, the root's no-argument message, Hamilton-owned arguments and options, root help/version behavior, output streams, and workbench result codes and operation results.
- **BREAKING:** Stop accepting the Effect-generated `--completions`, `--log-level`, and `--wizard` global options; retain Hamilton's documented command options.
- **BREAKING correction:** Make setup failures exit `2` instead of the current erroneous `0`, while preserving their stderr message and filesystem behavior.
- Preserve the four supported standalone binary targets and their ability to run without Bun, Node, or a source checkout.
- Keep the existing build and Vitest workflows working without Effect-TS tooling.

## Non-Goals

- Do not change setup's filesystem behavior, workbench operation semantics, or the bundle lookup contract.
- Do not change the release targets, installer layout, or runtime prerequisites for end users.
- Do not rewrite historical `.hamilton/changes/` records that document the former framework.
- Do not move workflow judgment owned by Hamilton's skills into the CLI.
- Do not include the separate pnpm monorepo migration.

## Proposed Change

Replace the Effect-TS command and runtime layer with NestJS modules and `nest-commander` command handlers across the root CLI, `setup`, and every `workbench` subcommand. Put setup and each workbench use case in its own injectable Nest service rather than wrapping the old operation functions in command classes; retain pure artifact and validation helpers outside the Nest container. Remove the Effect-TS package dependencies and the language-service script and TypeScript configuration. Update setup and workbench tests and active project instructions for the new framework. Keep Hamilton's documented command behavior and Bun standalone distribution intact except for the two explicit breaking changes above.

## Capabilities

### New

*(none)*

### Modified

- `cli-distribution`: Replace the CLI framework and remove Effect-TS tooling while preserving standalone releases and documenting the retired framework options and corrected setup failure code.
- `workbench`: Replace command adapters and move each use case into a Nest provider while preserving the documented operation interface and result contract.

### Removed

*(none)*

## Impact

The change affects `src/cli/`, the `src/workbench/` operation modules and their direct callers/tests, `package.json`, `bun.lock`, `tsconfig.json`, `AGENTS.md`, and any build or release configuration required for NestJS decorators and command execution. Each operation service owns use-case orchestration; command classes translate parsed arguments and render existing structured results without recreating the old free-function entry points. Pure parsing and validation helpers stay framework-independent. The release workflow must still compile and smoke-test the supported standalone binary. Project policy requires the implementation change to synchronize the package and source versions.
