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

`build` builds Core, then CLI. Dependency installation can write dependency directories. `bun run build` writes package output directories. `bun run typecheck` first builds Core and can write `packages/core/dist/`. Use an isolated checkout when the task permits only documentation changes.

## Test levels

| Command | Purpose and effects |
| --- | --- |
| `bun run test:unit` | Public behavior in isolation. Vitest's `unit` project runs on Bun. |
| `bun run test:integration` | Real component boundaries. The integration project runs without file parallelism. |
| `bun run test:package` | Pack Core into a disposable consumer and check its declarations. Packaging can rebuild Core output. |
| `bun run test:e2e` | Build packages, then run the general public CLI E2E project. It excludes the exact-native-archive E2E file. |
| `bun run test` | Source policy, typecheck, unit, integration, and general E2E gates. It is not every native distribution gate. |

Use a focused Vitest command when it proves the changed behavior:

```bash
bun --bun vitest run --project unit tests/unit/release-version.test.ts
```

Do not use `bun test`. Keep integration execution serial because packaging and other collaborators can rebuild shared output. E2E tests require the environment configured by their harness; the general suite uses Docker for applicable workflows. Inspect [`tests/e2e/harness.ts`](../tests/e2e/harness.ts) before choosing a test environment.

A passing unit or CLI test does not certify a host or agent. Smoke, load, stress, soak, performance, and chaos tests need separate approval and a defined question. Do not add them as routine documentation validation.

## Native archive E2E

`tests/e2e/release-archive.test.ts` is separate from the general E2E command. It requires the exact native target archive, its independently calculated SHA-256, the expected target, and the frozen source commit through `KEPLER_VERIFIED_ARCHIVE_PATH`, `KEPLER_VERIFIED_ARCHIVE_SHA256`, `KEPLER_EXPECTED_TARGET`, and `KEPLER_EXPECTED_SOURCE_COMMIT`. The test runs the extracted archive outside the checkout. It initializes a version-specific home, checks all packaged resources, and verifies that repeated setup preserves a settings edit and deleted resource. It also checks that missing `KEPLER_HOME` and unknown non-empty homes fail without creating fallback state.

The pull-request workflow executes this test on Linux x64. The release workflow runs the exact archive E2E on Linux x64, Linux arm64, macOS x64, and macOS arm64 before publishing. A configured matrix is not a passing result. A build or cross-compilation does not establish foreign-target execution.

## Resources and releases

The root version is authoritative across both packages, source release constants, compatibility, and resource generation. The release major determines supported artifact schema compatibility. Independent record formats keep their own counters.

For an authorized version change:

```bash
bun run release:prepare patch
bun run release:check
```

`release:prepare` also accepts `minor`, `major`, or an explicit version. It writes package versions, source release constants, generated resources, and a release note. Resource generation can also delete stale bundled skill files. **Do not run it in a documentation-only task.**

For an authorized packaged-resource change (including a new skill ID, which must appear in both `scripts/resource-generation.ts` and `packages/cli/src/cli/release-resources.ts`, in fixtures and inventory tests, and in the host profiles):

```bash
bun run prepare:bundle
bun run release:check
```

The preparation command writes packaged resources and their manifest. It can also delete stale bundled skill files. Review the complete inventory, required flags, nested references/notices, host profiles, and digest. Author skill changes in `skills/` and profiles in `bundle/agents/`; generation copies complete skill trees to `bundle/skills/`. Never change a user's initialized home to simulate a package update. Keep skill/package checks distinct from live-agent adherence.

A complete target archive contains the compiled CLI and resource package. The archive builder verifies embedded identity, source, frozen dependencies, resources, and written bytes. Production builds require eligible clean source. Development identity does not become production identity because files are copied or a filename changes.

The repository does not provide a persistent development installer or host-registration harness. Development packages and temporary homes must remain isolated from user homes and host settings.

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
