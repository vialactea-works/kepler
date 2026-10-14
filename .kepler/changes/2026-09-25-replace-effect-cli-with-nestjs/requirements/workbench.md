---
artifact: requirements-change
capability: workbench
change: 2026-09-25-replace-effect-cli-with-nestjs
status: draft
created: 2026-09-25
author: Caio Ferreira <caiorcferreira@gmail.com>
decision: accepted
---

# Capability: workbench

## ADDED Requirements

### Requirement: Injectable workbench use cases

Each `isolate`, `diff`, `precondition`, `context`, `prototype`, and `lint` use case SHALL execute its operation in its own Nest-injected provider, rather than retaining a free-function implementation behind a Nest command adapter.

- Priority: must
- Rationale: Each use case needs an independently injectable boundary for its operation policy and runtime collaborators.

#### Scenario: Nest resolves an operation service

- WHEN a workbench command executes in the Nest application
- THEN its handler calls that operation's injected service, and the service uses its own replaceable runtime ports to produce the existing structured result

#### Scenario: Service can be exercised without the CLI

- WHEN an operation service is supplied substitute filesystem, process, or Git collaborators in a test
- THEN its use-case behavior can be exercised without starting the CLI or using the host's real collaborators

## MODIFIED Requirements

### Requirement: Workbench command contract

The `hamilton workbench` namespace SHALL retain all six operations: `isolate`, `diff`, `precondition`, `context`, `prototype`, and `lint`. It SHALL preserve each operation's documented arguments and options, validation rules, stdout and stderr behavior, state changes, final load-bearing result lines, and result codes: `0` for success or affirmative results, `1` for normal negative or failed checks, and `2` for usage or environment errors. Lint SHALL retain its explicit file-or-change-directory scope and existing finding behavior. Effect-generated global options are retired as specified by `cli-distribution`; they are not operation options.

- Priority: must
- Rationale: Replacing the command framework must not change the CLI contract consumed by Hamilton's skills and users.

#### Scenario: Workbench help

- WHEN a user invokes `hamilton workbench --help`
- THEN help lists `isolate`, `diff`, `precondition`, `context`, `prototype`, and `lint`

#### Scenario: Negative operational result

- WHEN a workbench operation returns a normal negative check
- THEN the CLI returns exit code `1`, preserves the operation's output streams, and emits its load-bearing result line when the operation defines one

#### Scenario: Usage or environment error

- WHEN a workbench invocation has invalid arguments or encounters a usage or environment error
- THEN the CLI returns exit code `2` and preserves the documented error stream and operation-level message behavior without running the operation

#### Scenario: Parser rejects malformed workbench invocation

- WHEN a workbench subcommand receives an unknown option or a required option value is omitted
- THEN it reports a single usage error on stderr, exits `2`, and does not call the operation service

#### Scenario: Lint scope

- WHEN lint receives exactly one of `--file <file>` or `--change-dir <dir>`
- THEN it validates only that scope and preserves its current diagnostics and result code

#### Scenario: Invalid lint scope

- WHEN lint receives neither selector, both selectors, or an invalid selector
- THEN it returns exit code `2` without inspecting files outside a valid explicit scope
