---
artifact: requirements-change
capability: cli-distribution
change: 2026-09-25-replace-effect-cli-with-nestjs
status: draft
created: 2026-09-25
author: Caio Ferreira <caiorcferreira@gmail.com>
decision: accepted
---

# Capability: cli-distribution

## ADDED Requirements

### Requirement: Nest command runtime

The Hamilton CLI SHALL register and execute its root, setup, and workbench commands through NestJS and `nest-commander`.

- Priority: must
- Rationale: One framework owns command parsing and dispatch, and Nest composes the application.

#### Scenario: CLI commands use NestJS

- WHEN the CLI entry point starts and receives a supported root, setup, or workbench invocation
- THEN the Nest application resolves the matching command class and executes it

### Requirement: Injectable setup use case

Setup orchestration SHALL run in a Nest-injected setup service rather than in the setup command handler.

- Priority: must
- Rationale: Setup shares the same provider-oriented application boundary as workbench operations.

#### Scenario: Setup resolves its dependencies

- WHEN the Nest application starts and the setup command is invoked
- THEN its handler calls the injected setup service, which resolves its filesystem and bundle collaborators through providers

### Requirement: Effect-TS removal from active files

Current CLI source, tests, package dependencies, package scripts, TypeScript configuration, and active project guidance SHALL contain no Effect-TS framework dependency or Effect-TS-specific tooling.

- Priority: must
- Rationale: No obsolete runtime or build dependency should remain after replacing the framework.

#### Scenario: Effect-TS is absent from active project files

- WHEN the source, tests, package manifests, lockfile, TypeScript configuration, package scripts, and active project instructions are inspected
- THEN they contain no Effect-TS imports, dependencies, or Effect-TS-specific configuration

### Requirement: Canonical CLI version

The CLI's root `--version` SHALL print the canonical project `VERSION` and exit `0` from both source execution and the standalone binary.

- Priority: must
- Rationale: A framework-owned version flag must still report the release's single version source.

#### Scenario: Source and compiled version

- WHEN the source CLI or a standalone executable is invoked with root `--version`
- THEN stdout contains exactly the canonical version followed by a newline and the exit code is `0`

### Requirement: CLI parser usage errors

The CLI SHALL report unknown commands, unknown options, and missing option values on stderr with exit code `2`, without executing a use case.

- Priority: must
- Rationale: These failures occur before Nest command handlers run and require an explicit parser-level boundary.

#### Scenario: Parse fails before command dispatch

- WHEN an invocation contains an unknown command, unknown option, or missing required option value
- THEN it reports the usage error once on stderr, returns `2`, and does not start setup or a workbench operation

#### Scenario: Help is not a usage failure

- WHEN the root or a supported command receives `--help`
- THEN it displays its help on stdout and exits `0`

## MODIFIED Requirements

### Requirement: Installed CLI command options

The source and installed CLI SHALL retain the root's no-argument message and help/version, `setup [--force]`, and the existing Hamilton-owned `workbench` operation arguments and options. BREAKING: the Effect-generated global `--completions`, `--log-level`, and `--wizard` options SHALL no longer be accepted or advertised; invoking any of them SHALL result in a usage error rather than starting an operation.

- Priority: must
- Rationale: Keep Hamilton's maintained command contract without retaining framework-generated features solely for compatibility.

#### Scenario: Hamilton-owned commands remain available

- WHEN a user invokes the root without arguments, root help, setup, or an existing workbench operation and option
- THEN the CLI preserves the root message or accepts the command, and help lists the supported commands

#### Scenario: Retired Effect-generated flag is rejected

- WHEN a user invokes `--completions`, `--log-level`, or `--wizard`
- THEN the CLI reports a usage error on stderr and exits `2` without starting an operation

#### Scenario: Retired flags are absent from help

- WHEN a user reads root or command help
- THEN `--completions`, `--log-level`, and `--wizard` are not listed

### Requirement: Standalone executable distribution

The CLI SHALL continue to publish standalone executables for macOS x64, macOS arm64, Linux x64, and Linux arm64. An installed executable SHALL run without Bun, Node, or a Hamilton source checkout and SHALL resolve the bundle from the configured override or its installed sibling. Source-checkout execution SHALL continue to use the checkout bundle, and setup SHALL report the checked locations if no bundle is available.

- Priority: must
- Rationale: The framework migration must preserve the installed-binary contract already relied on by Hamilton users.

#### Scenario: Installed standalone executable

- WHEN a released executable runs from its installed layout with a sibling bundle
- THEN it executes supported commands and setup resolves assets without Bun, Node, or a source checkout

#### Scenario: Missing bundle

- WHEN neither the configured bundle override, installed sibling bundle, nor source-checkout bundle exists
- THEN setup fails and identifies the locations it checked

### Requirement: Setup assets and failure status

`hamilton setup` SHALL continue to install and report bundle templates and guidelines, create or preserve the Hamilton home and settings without changing existing helper scripts, and report a bundle or filesystem failure through its existing stderr error message with exit code `2`. The failure status corrects the prior erroneous `0` and is a breaking change to that failure path.

- Priority: must
- Rationale: A failed setup must not report process success to users or installers.

#### Scenario: Fresh or existing setup

- WHEN setup succeeds on a fresh or existing Hamilton home
- THEN the templates and guidelines are installed and reported, settings are created or preserved, helper scripts remain untouched, and setup exits `0`

#### Scenario: Setup encounters a filesystem failure

- WHEN setup cannot create its home directories or write the required assets
- THEN it prints one `Setup failed: ...` message to stderr and exits `2` without claiming success

#### Scenario: Setup cannot locate the bundle

- WHEN setup cannot resolve a configured, sibling, or checkout bundle
- THEN it prints one `Setup failed: ...` message naming the checked paths to stderr and exits `2`
