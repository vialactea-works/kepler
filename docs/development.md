# Develop Kepler

Use this guide to build, test, or document the repository. Read [Contributing](../CONTRIBUTING.md) and [AGENTS.md](../AGENTS.md) first.

## Workspace and dependencies

Kepler is an ESM TypeScript monorepo managed by Bun 1.4.0. The root `packageManager` field supplies the CI pin. The `@types/bun` version is a separate dependency version.

| Area | Responsibility |
| --- | --- |
| `packages/core` | Shared configuration, paths, artifact parsing, metadata, and event envelopes. |
| `packages/cli` | Nest CLI adapters, Construction operations, setup, history, audit, and earlier workbench operations. |
| `bundle` | Packaged templates, guidelines, skill trees, profiles, notices, and manifest. |
| `skills` | Skill source trees. Not every source skill is part of the release package. |
| `tests` | Unit, integration, public CLI, native distribution, and E2E checks. |
| `docs` | User and contributor documentation. `docs/specs` is a separate specification area. |

Keep application rules independent of Nest and external effects. Use the existing typed ports and adapters. Public Core exports are listed in [`packages/core/src/index.ts`](../packages/core/src/index.ts). The executable entrypoint is [`packages/cli/src/cli/main.ts`](../packages/cli/src/cli/main.ts).

## Build

```bash
bun --version
bun install --frozen-lockfile
bun run check:typescript-sources
bun run typecheck
bun run build
bun run check:version
```

`build` builds Core, then CLI. Dependency installation can write dependency directories. `bun run build` writes package output directories. Use an isolated checkout when the task permits only documentation changes.

## Test levels

| Command | Purpose and effects |
| --- | --- |
| `bun run test:unit` | Public behavior in isolation. Vitest's `unit` project runs on Bun. |
| `bun run test:integration` | Real component boundaries. The integration project runs without file parallelism. |
| `bun run test:package` | Pack Core into a disposable consumer and check its declarations. Packaging can rebuild Core output. |
| `bun run test:e2e` | Build packages, then run the general public CLI E2E project. It excludes exact-archive and development-package files. |
| `bun run test` | Source policy, typecheck, unit, integration, and general E2E gates. It is not every native distribution gate. |

Use a focused Vitest command when it proves the changed behavior:

```bash
bun --bun vitest run --project unit tests/unit/release-version.test.ts
```

Do not use `bun test`. Keep integration execution serial because packaging and other collaborators can rebuild shared output. E2E tests require the environment configured by their harness; the general suite uses Docker for applicable workflows. Inspect [`tests/e2e/harness.ts`](../tests/e2e/harness.ts) before choosing a test environment.

A passing unit or CLI test does not certify a host or agent. Smoke, load, stress, soak, performance, and chaos tests need separate approval and a defined question. Do not add them as routine documentation validation.

## Native distribution tests

Exact-archive tests and development-package tests are separate from the general E2E command. They need a native target archive and existing supported host collaborators. Read [`tests/helpers/native-pi-host.ts`](../tests/helpers/native-pi-host.ts) and the relevant test's admission conditions before running them.

| Variable | Harness input |
| --- | --- |
| `KEPLER_PI_BINARY` | Actual Pi CLI. |
| `KEPLER_PI_SUBAGENTS_ROOT` | Existing pi-subagents package root. |
| `KEPLER_PI_NODE_BINARY` | Explicit Node interpreter for npm Pi mode. |
| `KEPLER_PI_SDK_ENTRY_PATH` | Public Pi SDK entry in npm mode. |

Standalone Pi mode uses the first two variables. Npm mode also needs the last two. The supported versions are Pi 1.2.0 and pi-subagents 0.76.1. Reuse approved existing installations or obtain installation authority. Keep mutable home, cache, agent, and project roots isolated. Do not start models or sessions as an implicit test effect.

Only native execution establishes behavior on a target. A build or matrix declaration does not establish foreign-target execution.

## Resources and releases

The root version is authoritative across both packages, source release constants, compatibility, and resource generation. The release major determines supported artifact schema compatibility. Independent record formats keep their own counters.

For an authorized version change:

```bash
bun run release:prepare patch
bun run release:check
```

`release:prepare` also accepts `minor`, `major`, or an explicit version. It writes package versions, source release constants, generated resources, and a release note. Resource generation can also delete stale bundled skill files. **Do not run it in a documentation-only task.**

For an authorized packaged-resource change:

```bash
bun run prepare:bundle
bun run release:check
```

The preparation command writes packaged resources and their manifest. It can also delete stale bundled skill files. Review the complete inventory and digest. Do not edit immutable installed generations.

A complete target archive contains the compiled CLI and resource package. The archive builder verifies embedded identity, source, frozen dependencies, resources, and written bytes. Production builds require eligible clean source. Development identity does not become production identity because files are copied or a filename changes.

`bun run dev:package` builds and validates a development archive in an owned temporary root. It checks isolated setup and repeatable no-op behavior. It requires existing Pi collaborators and removes its temporary root. It does not leave a persistent installation.

Release CI tests the exact archives that it uploads. Publication and Core package reconciliation check immutable identity and bytes. Publication, deployment, push, and tag operations require separate authority.

## Maintain documentation without changing specifications

1. Inventory the public command tree with `kepler --help` and each group's `--help`.
2. Read command definitions, request validators, adapters, and tests.
3. Separate observed behavior from intended specification behavior.
4. Update the relevant domain document and navigation.
5. Validate examples in disposable projects with isolated home and configuration paths.
6. Apply the copyedit skill to every changed document.
7. Verify links, command coverage, and the final changed-path scope.

The repository has no dedicated public CLI-reference generator. Help output can support a read-only command inventory. It does not describe every semantic request or state condition.

Keep `docs/specs/**`, `.kepler/specs/**`, templates, skills, design contracts, and other specification artifacts unchanged during a documentation-only task. Some specifications live outside directories named `specs`. Protect their contents and paths too. Do not run a generator merely to make documentation examples pass. Report implementation defects and specification differences without changing those artifacts.
