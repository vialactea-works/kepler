# Proposal: CLI Binary Distribution

| Field   | Value                                    |
|---------|-------------------------------------------|
| Change  | 2026-07-17-cli-binary-distribution         |
| Status  | draft                                      |
| Author  | Caio Ferreira (via Claude)                 |
| Created | 2026-07-17                                 |

## Why

Installing Hamilton today means having `bun` on your machine, cloning the repo (or letting
`install.sh` do it for you), running `bun install`, and building from source. That's a heavy
ask for a CLI tool, and it ties every install to the Bun toolchain being present and working.
Hamilton's own CLI entrypoint already only runs under Bun (`#!/usr/bin/env bun`, `bun:sqlite`,
`@effect/platform-bun`), so there's no path to a plain-Node install either — the dependency is
structural, not incidental. The fix is to publish prebuilt, self-contained binaries and let
`install.sh` fetch one instead of building from source.

## Goals & Success Criteria

- A GitHub Actions workflow builds standalone `hamilton` binaries for macOS and Linux, on both
  x64 and arm64, and publishes them as GitHub Release assets whenever `package.json`'s version
  changes on `main`.
- The workflow tags the release to match `package.json`'s version, and publishes a checksums
  file so downloads can be verified.
- `install.sh` downloads the binary matching the caller's OS/arch (plus the supporting asset
  bundle `hamilton setup` needs) from the latest GitHub Release, verifies its checksum, and
  installs it — with no `bun`, `git`, or `node` required on the target machine.
- Running the installed binary (`hamilton setup`, `hamilton doctor`, `hamilton workflow list`,
  etc.) works identically to running it from a source checkout.

## Non-Goals

- Windows binaries or a Windows install path (may follow later; out of scope here).
- Publishing to npm, Homebrew, or any other package registry — GitHub Releases only.
- Code signing / macOS notarization of the binaries.
- An auto-updater or `hamilton upgrade` command — reinstalling via `install.sh` is the update
  path for now.
- Fully embedding the `bundle/` assets (agents, skills, workflows, templates) inside the
  compiled executable. They ship as a separate archive alongside the binary (see design.md);
  a fully self-contained single file is a possible future iteration, not this change.
- Changing the existing contributor workflow (`bun install`, `bun run build`,
  `bun run install-local`) — that keeps working as-is for local development.

## Proposed Change

Two things change from a user's perspective:

1. **New release artifacts.** Pushing a version bump to `package.json` on `main` triggers a
   GitHub Actions workflow that tags the release, builds a `hamilton` binary for each supported
   OS/arch via `bun build --compile`, packages the `bundle/` directory into a single
   platform-independent archive, generates a checksums file, and publishes all of it as a
   GitHub Release.
2. **A rewritten `install.sh`.** Instead of requiring `bun` and building from source, it detects
   the caller's OS/arch, downloads the matching binary and the asset bundle from the latest
   release, verifies the checksum, and installs both — `hamilton` ends up on `PATH` the same
   way it does today (`~/.local/bin/hamilton`).

Internally, `hamilton setup` currently locates its bundled assets (agents, skills, workflows,
templates) by walking up from the running script's file location — a path that only exists in a
source checkout, not inside a compiled single-file binary. That resolution logic needs to also
handle "assets live in a sibling directory next to this binary," which is the layout the new
`install.sh` produces. This is the one piece of runtime behavior this change touches; everything
else is build/release tooling.

## Capabilities

### New

- `cli-distribution`: builds, publishes, and installs Hamilton as a prebuilt binary — the
  release workflow, the artifact layout, and the runtime asset resolution that makes a
  standalone binary able to find its bundled assets.

## Impact

- **New:** `.github/workflows/release.yml` (or similar), a build script/target for
  `bun build --compile`, `install.sh` rewritten, a bundle-dir resolution helper in `src/`.
- **Changed:** `src/cli/commands/setup.ts` and `src/cli/commands/install-logic.ts` — their
  `PROJECT_ROOT`-relative asset lookup gains a second resolution path for the compiled-binary
  layout.
- **Unaffected:** `bun run build`, `bun run install-local`, `bun run test` — the existing
  source-based dev workflow is untouched.
- **Users:** anyone running `install.sh` gets a faster, lighter install with no Bun dependency.
  Contributors are unaffected.

## Open Questions

- None outstanding — platform matrix, release trigger, bundle-asset strategy, and install.sh
  scope were resolved during proposal drafting (see design.md Decisions).
