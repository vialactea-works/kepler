# Kepler — Agent Instructions

Bun-managed monorepo for the Kepler CLI and its reusable core package (TypeScript, NestJS with `nest-commander`).

## Essential Commands

```bash
bun install
bun run build
bun --bun vitest run
```

**Run tests with Vitest on Bun; do not use `bun test`.** Run one test file with `bun --bun vitest run tests/cli/setup.test.ts`. `bun run test` invokes the complete Vitest suite.

`bun run build` is the TypeScript build gate. To install locally, `bun run install-local` builds and symlinks `packages/cli/dist/cli/main.js` to `~/.local/bin/kepler`. `bun run purge` removes that symlink and `~/.kepler-dist/`; it preserves global Kepler data.

## Packages and Architecture

The workspace has exactly two packages:

- `packages/core` — `@vialactea-works/kepler-core`: settings parsing, global/project paths, and safe legacy-data migration.
- `packages/cli` — `@vialactea-works/kepler-cli`: the `kepler` executable, Nest commands, setup, and workbench operations.

Other top-level project areas:

- `bundle/` — templates and guidelines copied into Kepler's global data directory.
- `skills/kepler-*/` — portable Kepler skills, installed separately by coding-agent skill managers.
- `tests/` — CLI, workbench, docs, and skill contract tests; `packages/core/tests/` covers core behavior.
- `docs/` — user-facing workflow, skill, and release documentation.

The CLI entrypoint is `packages/cli/src/cli/main.ts`; Nest commands live in `packages/cli/src/cli/nest/`. Workbench services and helpers live in `packages/cli/src/workbench/`. Core exports are defined by `packages/core/src/index.ts`.

## Data Paths and Compatibility

Kepler's global home is `${XDG_CONFIG_HOME:-$HOME/.config}/vialactea-works/kepler/`; project artifacts live under `.kepler/`. The previous hidden global path `${XDG_CONFIG_HOME:-$HOME/.config}/.vialactea-works/kepler/`, old global `~/.hamilton/`, and project `.hamilton/` paths remain read-only migration sources: Kepler copies legacy data only when the corresponding canonical path does not exist, keeps the source intact, and prefers an existing canonical path without merging or deleting legacy data. If both legacy global paths exist and the canonical path does not, the previous hidden global path takes precedence. Do not manually remove a legacy source as part of migration.

Bundle lookup can be overridden with `KEPLER_BUNDLE_DIR` in tests or development.

## Critical Conventions

- **No comments in code** — zero, ever.
- **ESM with `.js` extensions** in imports: `import { x } from "./foo.js"`, including imports of TypeScript files.
- **Errors and results**: thrown custom errors extend native `Error`; workbench services return structured results with `stdout`, `stderr`, and `exitCode`.
- **`bun.lock` is text** (not `bun.lockb`, which is ignored).
- **Pin every dependency version** — no `~` or `^` in `package.json`.
- Keep the root `package.json`, both package versions, and `src/index.ts`'s `VERSION` synchronized for a release.
- The installed CLI command is `kepler`; do not add a `hamilton` alias.
- Release workflows compile a standalone Bun binary for each supported platform; keep the sidecar `bundle/` available for setup.

## Testing Patterns

- `vitest.config.ts` sets `globals: false`; import `describe`, `it`, and `expect` from `vitest`.
- Tests touching home-directory data use a temporary `HOME` and `XDG_CONFIG_HOME`, then restore them.
- Test bundle lookup with a temporary bundle or `KEPLER_BUNDLE_DIR`.
- Prefer real temporary filesystem and Git fixtures where useful; unit tests can inject fake runtime ports, and Nest provider wiring belongs in Nest testing-module coverage.
- Run a focused test with `bun --bun vitest run <path>`.

## CLI Conventions

- Nest command classes under `packages/cli/src/cli/nest/` extend `CommandRunner` and use `@Command` or `@SubCommand`.
- Setup orchestration belongs in `SetupService`.
- Operation services use `@Injectable()` and inject only their typed runtime ports; keep pure helpers independent of Nest.
- Workbench operations live under `packages/cli/src/workbench/`, one per operation.
- Command handlers report structured output and exit codes through `ResultReporter`.

## TODO Conventions

When a task in `TODO.md` is marked `[x]` done, move it from `## Next Up` to `## Completed`. Completed items use `- [x]` and stay ordered by completion time (most recent first).
