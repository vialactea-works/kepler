# Contributing to Kepler

Read [AGENTS.md](AGENTS.md) before changing code. It records architecture, data boundaries, tests, bundle ownership, and release rules. Kepler's user-facing guide starts at [README.md](README.md).

## Verify changes

Install the pinned workspace dependencies and run the gates that cover your change:

```bash
bun install --frozen-lockfile
bun run check:typescript-sources
bun run typecheck
bun run build
bun run test:unit
bun run test:integration
bun run test:e2e
bun run test:package
bun run check:version
```

Use `bun --bun vitest run <path>` for a focused test. Do not use `bun test`. Unit tests cover isolated public contracts; integration tests use the real collaborating component under test; execa E2E tests exercise complete CLI workflows and distribution behavior. Do not add smoke tests or infer host/agent certification from executable tests.

## Keep documentation aligned

Update the root README and the relevant user guide whenever behavior, command syntax, installation, recovery, or version boundaries change. Update the release note for user-visible release behavior. Keep the v3 specification separate from implementation evidence: accepted design is not proof that a feature shipped.

When a change affects skills, native agent definitions, templates, or guidelines, run `bun run prepare:bundle`, inspect the full manifest and digest, and test the sidecar behavior. Skill managers own skill installation; Claude Code owns native role installation. Do not claim that `kepler setup` installs either.

## Version and release boundaries

Keep `package.json`, `packages/cli/package.json`, `packages/core/package.json`, `src/index.ts`'s `VERSION`, bundle compatibility, and release checks synchronized. Pin dependency versions without `^` or `~`.

CI tests native standalone behavior on Linux and macOS for x86_64 and arm64. The release cross-compilation matrix produces artifacts but does not prove execution on those targets. Record only target results from completed native jobs. Do not publish a release or deploy a host as part of testing; release and deployment require separate authorization.

## License and attribution

Kepler is licensed under Apache-2.0. When adapting a skill, keep the upstream license notice in that skill's `NOTICE` file and preserve the notice in the release bundle. See [NOTICE](NOTICE) and the adjacent skill notices for examples.
