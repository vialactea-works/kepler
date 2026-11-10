# Kepler repository guidance

Kepler is a Bun-managed TypeScript monorepo. The shipped CLI implements version 3 Construction operations and retains the earlier `workbench` command surface for change-based artifacts. Do not treat the legacy surface as a v3 migration path.

## Workspace

The repository has two packages:

- `packages/core` — `@vialactea-works/kepler-core`: settings, global/project paths, and reusable artifact/event contracts.
- `packages/cli` — `@vialactea-works/kepler-cli`: the `kepler` executable, Nest commands, workflow history, Construction operations, setup, and legacy workbench operations.

Other relevant areas:

- `bundle/` — versioned templates, guidelines, portable skills, Claude Code role definitions, and their manifest.
- `skills/` — skill sources. The release bundle contains eleven v3 skills; other repository skills are not automatically part of that release bundle.
- `docs/specs/v3/` — detailed Construction and installation contracts; check their implementation/status notes before using them as evidence of shipped behavior.
- `docs/` — user, contributor, workflow, and release documentation.
- `tests/` — Vitest unit, integration, packed-package, and execa-driven CLI E2E tests.

The CLI entrypoint is `packages/cli/src/cli/main.ts`. CLI commands live in `packages/cli/src/cli/nest/`; application operations live under `packages/cli/src/`. Core exports are defined by `packages/core/src/index.ts`.

## Data and compatibility

The global home is `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/`. Project records live under `.kepler/`. The previous hidden global directory, `~/.hamilton/`, and project `.hamilton/` paths remain read-only sources for the existing safe path-copy behavior: Kepler copies legacy data only when the corresponding canonical path does not exist, preserves the source, and does not merge or delete data. If both legacy global paths exist and the canonical path does not, the previous hidden global path takes precedence.

Version 3 mission records and earlier change-based artifacts have separate ownership. Do not add compatibility conversion, silently adopt old history, or clean up legacy material as part of another change. `KEPLER_BUNDLE_DIR` overrides bundle lookup for development and tests.

## Code conventions

- Use Bun 1.4.0 for workspace builds and tests. The root `packageManager` field is the shared pin read by CI and release workflows; the `@types/bun` version is independent.
- Write authored source in TypeScript. `bun run check:typescript-sources` enforces this rule.
- Use ESM imports with `.js` extensions, including imports of TypeScript modules.
- Add no comments to code.
- Use native `Error` subclasses for custom errors. Workbench operations return structured results with `stdout`, `stderr`, and `exitCode`.
- Keep application/domain logic independent of Nest, CLI parsing, filesystem, Git, and process APIs. Add typed ports for concrete external effects and adapt them at the CLI boundary.
- Pin every dependency version in `package.json`; do not use `^` or `~`. `bun.lock` is text; do not add `bun.lockb`.
- Keep the root package, both package versions, `src/index.ts`'s `VERSION`, bundle compatibility, and release checks synchronized.
- The executable is `kepler`; do not add a `hamilton` alias.

## Tests and verification

Use Bun with Vitest; do not use `bun test`. Prefer unit tests for isolated public behavior, real collaborators for integration behavior, and a small execa E2E suite for complete CLI workflows and critical distribution behavior. E2E tests must clean up their temporary Git repositories, consumers, processes, and files. Do not add a smoke suite or claim agent certification from tests of CLI or skill files.

Run the applicable gates:

```bash
bun run check:typescript-sources
bun run typecheck
bun run build
bun run test:unit
bun run test:integration
bun run test:e2e
bun run test:package
bun run check:version
```

`bun run test` combines source policy, typecheck, unit, integration, and E2E gates. `bun run test:e2e` builds before running the E2E project. `bun run test:package` packs Core into a disposable consumer and typechecks its declarations. Do not substitute cross-compilation for native execution evidence. The CI matrix declares Linux and macOS on x86_64 and arm64; report only target jobs that actually passed.

## Release and bundle changes

Release assets are four complete target-specific archives (`linux-x64`, `linux-arm64`, `darwin-x64`, and `darwin-arm64`), the Core package tarball, and SHA-256 checksums with a release manifest. Each archive carries the standalone CLI and its versioned resource package; there is no split bundle sidecar. The release workflow gates versioned releases on workspace checks and native exact-archive E2E for all four targets; it has no Linux cross-compilation job. Do not publish a release or deploy as a test effect.

Use `bun run release:prepare <patch|minor|major|version>` for a release version change; it synchronizes the root and package versions, source release constants, release note, and generated resource manifest. Run `bun run prepare:bundle` after changing versioned skills, agent definitions, templates, or guidelines, then review the complete manifest and content digest and run `bun run release:check`. Resource generation is derived from the root release version and bundle contents; do not update obsolete per-resource release counters.

## Documentation

Keep `README.md`, `docs/cli.md`, `docs/skills.md`, `docs/installation.md`, `docs/recovery.md`, `docs/sdd-framework.md`, and the applicable release notes aligned with executable behavior. Keep the distinction between accepted specification, shipped behavior, deferred work, native execution, and cross-compilation explicit. Do not describe unsupported migration, host certification, publication, or deployment behavior as available.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributor steps and [docs/specs/v3/README.md](docs/specs/v3/README.md) for the version 3 contract index.
