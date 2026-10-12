---
artifact: requirements-spec
capability: cli-distribution
status: current
updated: 2026-09-27
author: Hermes Agent
decision: accepted
---

# Capability: cli-distribution

## Overview

Hamilton is built, published, and installed as a prebuilt binary with a versioned bundle of assets. The distribution supports source-checkout and installed-binary execution, and the installed setup flow makes the supported templates, guidelines, settings, and workbench available without requiring a source checkout or a separately installed helper runtime.

## Contract

### CLI interface
The root invocation without arguments preserves its existing message. Root and supported-command `--help` print help to stdout and exit `0`. Root `--version` prints the canonical project version followed by a newline and exits `0`. `setup` accepts `--force`; `workbench` exposes the six operations defined by the workbench capability and retains their documented arguments and options.

Unknown commands, unknown options, missing option values, and retired flags produce one usage error on stderr with exit `2` before any use case runs. The retired flags are `--completions`, `--log-level`, and `--wizard`; help does not advertise them.

### Released artifacts

The distribution publishes one standalone executable for each supported macOS x64, macOS arm64, Linux x64, and Linux arm64 target, a platform-independent archive containing the repository bundle, and a checksums file with a SHA-256 digest for every executable and the bundle archive.

### Installed binary

A released executable runs without Bun, Node, or a Hamilton source checkout. Bundle resolution checks a configured override first, then the installed sibling bundle, then the source-checkout bundle when running from source.

### Setup assets

`hamilton setup` installs and reports the bundle's templates and guidelines, creates or preserves the Hamilton home and settings, and exposes the distributed workbench command. It does not install or report Hamilton-owned shell helper scripts. Existing content under `~/.hamilton/scripts/` remains unchanged.

### Installation

The install script accepts an optional version override, downloads the matching executable and bundle archive from a GitHub Release, verifies both against the release checksums, installs the executable on `PATH`, unpacks the bundle beside it, and runs assisted setup. Supported platforms are macOS x64, macOS arm64, Linux x64, and Linux arm64.

## Behavior

A version change on the default branch produces a tag, all supported binaries, the bundle archive, checksums, and a GitHub Release. A commit without a version change produces no release, and an already-existing computed tag causes the release workflow to fail without overwriting it.

The executable resolves the bundle from a configured override, then from its installed sibling, then from the source-checkout bundle. If no location resolves, setup fails and identifies the paths checked. A bundle or filesystem failure emits one `Setup failed: ...` message on stderr and exits `2`; successful setup exits `0`.

On a supported target, installation verifies downloaded assets before placing them on `PATH`, unpacks the bundle beside the executable, and runs setup. An unsupported target fails with the detected platform and supported platform list without attempting a source build. A checksum mismatch aborts before installing the mismatched asset. A version override selects that release instead of the latest one.

Setup on a fresh Hamilton home installs templates, guidelines, settings, and the workbench without creating helper scripts. Setup on an existing home preserves stale helper files byte-for-byte and does not announce them as newly installed.

**Examples**

- `hamilton --version` -> the canonical project version followed by a newline on stdout, exit `0`
- unknown command, unknown option, missing option value, or retired flag -> one usage error on stderr, exit `2`, no use case runs
- setup bundle or filesystem failure -> one `Setup failed: ...` message on stderr, exit `2`, no success listing
- version changes on `main` -> a tagged release contains four binaries, the bundle archive, and checksums
- version is unchanged on `main` -> no tag, build, or release is created
- installed binary has a sibling bundle -> setup resolves assets without a source checkout
- neither source nor sibling bundle exists -> setup fails naming both checked locations
- supported platform installation -> verified binary and bundle are installed and setup runs
- unsupported platform -> installation fails with the detected and supported platforms and does not source-build
- downloaded asset checksum differs -> installation aborts before installing that asset
- fresh setup -> templates, guidelines, settings, and workbench are available without new helper scripts
- existing `~/.hamilton/scripts/` content -> setup leaves it unchanged and omits it from the installed-asset report

## Invariants

- Source and standalone CLI invocations MUST report the canonical project version.
- CLI parser failures MUST return `2` without dispatching a use case.
- Published checksums MUST cover every binary and the bundle archive in the release.
- A release MUST NOT overwrite an existing tag or release.
- The installed executable MUST run without Bun, Node, or a Hamilton source checkout.
- Setup MUST NOT delete or rewrite existing `~/.hamilton/scripts/` content.
- Setup MUST NOT require a `scripts/` directory in the distributed bundle.
- Unsupported platforms MUST NOT trigger a source build.

## Decisions

- Releases are tied to explicit version changes on the default branch rather than every merge or a manual dispatch.
- The bundle is published separately from the executable because setup needs versioned assets at runtime.
- Installed binaries resolve assets relative to their executable while source runs retain checkout-relative resolution.
- The workbench is the single maintained implementation of Hamilton-owned workflow mechanics; setup stops installing shell helpers while preserving existing user files.
- Migration between CLI and skill generations is non-destructive: users update the CLI and skills together, and stale helper files are removed only through the explicit purge path when desired.
