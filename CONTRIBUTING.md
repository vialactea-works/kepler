# Contribute to Kepler

Use this guide to start repository work. Read [AGENTS.md](AGENTS.md) for repository rules. Read [Development](docs/development.md) for architecture, build commands, test levels, resources, and release checks.

## Prepare the workspace

Use Bun 1.4.0. The root `packageManager` field supplies the shared toolchain pin.

```bash
bun --version
bun install --frozen-lockfile
bun run check:typescript-sources
bun run typecheck
bun run build
```

Keep dependency versions exact. Use TypeScript and ESM imports with `.js` extensions. Keep application rules independent of Nest, Git, filesystem, and process APIs. Reuse the existing ports and adapters.

## Verify the change

Run the gates that cover the changed behavior:

```bash
bun run test:unit
bun run test:integration
bun run test:e2e
bun run test:package
bun run check:version
```

Use Vitest on Bun. Do not use `bun test`. Integration tests run serially. The packed-Core test uses a disposable consumer. The general E2E command builds packages and requires its configured test environment. Exact-archive and development-package tests have separate native prerequisites. See [Development](docs/development.md#test-levels).

Do not add smoke or performance tests without explicit approval. Do not infer agent certification from CLI or resource tests.

## Maintain documentation

Start at the [documentation index](docs/README.md). Update the relevant user guide when implemented behavior changes. Keep commands, examples, defaults, and failure descriptions consistent with source and tests.

Keep documentation and specifications separate. Treat specification changes as a separate task with explicit authority. A documentation-only change must not run generators or formatters that rewrite contracts, templates, skills, or application files. Use the copyedit skill on each changed document. Keep technical identifiers unchanged.

## Change packaged resources

For a resource change, run `bun run prepare:bundle`. Review the full inventory and digest. Then run `bun run release:check`. Do this only when the task permits resource and manifest changes.

The current distribution uses complete target archives, not a split bundle sidecar. Pi setup registers the package containing the portable skills and Pi roles. Other hosts own their installation procedures. See [Installation](docs/installation.md).

## Prepare a release

Use `bun run release:prepare <patch|minor|major|version>` for an authorized version change. The command synchronizes package versions, source constants, release notes, and the resource manifest.

All four target-native jobs must test their exact archives before publication. A job declaration is not a passing result. Testing does not authorize a release, deployment, push, or tag.

## Preserve attribution

Kepler uses Apache-2.0. Preserve each adapted skill's `NOTICE` file and its packaged notice. See [NOTICE](NOTICE).
